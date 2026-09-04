'use strict';

const { creationSummary } = require('../versioning');

module.exports = function registerVersionRoutes(app, { db, resolveEntity, canReadItem, canUpdate, sanitizeItem, denied }) {
  const VERSIONED = new Set(['tasks', 'labs', 'meetings']);

  const resolveVersioned = (entityType, ref) => {
    if (!VERSIONED.has(entityType)) return null;
    const item = resolveEntity(entityType, ref);
    if (!item) return null;
    if (entityType === 'labs' && item.entityType === 'idea') return null;
    return item;
  };

  app.get('/api/versions/:entityType/:id', (req, res) => {
    const { entityType, id } = req.params;
    const item = resolveVersioned(entityType, id);
    if (!item) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem(entityType, item, req.auth.user)) return denied(res);

    // An untouched entity still has a meaningful current version. Persist the
    // baseline lazily so old canonical databases do not need a migration pass.
    db.versions.ensureInitial(entityType, item.id, item, item.createdByUserId || null, { summary: creationSummary(entityType), finalized: true });
    const users = new Map(db.auth.users.all().map((user) => [user.id, user]));
    const versions = db.versions.list(entityType, item.id).map((entry) => ({
      version: entry.version,
      createdAt: entry.createdAt,
      authorUserId: entry.authorUserId,
      authorName: users.get(entry.authorUserId)?.displayName || null,
      summary: entry.summary || '',
      finalized: entry.finalized,
      data: sanitizeItem(entityType, entry.data, req.auth.user),
      current: entry.data.updatedAt === item.updatedAt,
    }));
    res.json(versions);
  });

  app.post('/api/versions/:entityType/:id/finalize', (req, res) => {
    const { entityType, id } = req.params;
    const current = resolveVersioned(entityType, id);
    if (!current) return res.status(404).json({ error: 'not_found' });
    if (!canUpdate(entityType, current, req.auth.user)) return denied(res);
    const latest = db.versions.finalizeLatest(entityType, current.id);
    res.json(latest ? { version: latest.version, finalized: true } : { finalized: true });
  });

  app.delete('/api/versions/:entityType/:id/:version', (req, res) => {
    const { entityType, id } = req.params;
    const current = resolveVersioned(entityType, id);
    if (!current) return res.status(404).json({ error: 'not_found' });
    if (!canUpdate(entityType, current, req.auth.user)) return denied(res);

    const version = Number(req.params.version);
    const snapshot = db.versions.get(entityType, current.id, version);
    if (!snapshot) return res.status(404).json({ error: 'version_not_found' });

    const latest = db.versions.latest(entityType, current.id);
    if (latest?.version === version) {
      return res.status(409).json({ error: 'current_version_cannot_be_deleted' });
    }

    db.versions.remove(entityType, current.id, version);
    res.status(204).end();
  });

  app.post('/api/versions/:entityType/:id/:version/restore', (req, res) => {
    const { entityType, id } = req.params;
    const current = resolveVersioned(entityType, id);
    if (!current) return res.status(404).json({ error: 'not_found' });
    if (!canUpdate(entityType, current, req.auth.user)) return denied(res);
    const snapshot = db.versions.get(entityType, current.id, Number(req.params.version));
    if (!snapshot) return res.status(404).json({ error: 'version_not_found' });

    db.versions.ensureInitial(entityType, current.id, current, current.createdByUserId || null, { summary: creationSummary(entityType), finalized: true });
    const restoredData = { ...snapshot.data };
    delete restoredData.id;
    delete restoredData.createdAt;
    delete restoredData.updatedAt;
    // Human-readable identifiers belong to the entity, not to the historical
    // payload chosen for restore.
    if (entityType === 'tasks') restoredData.taskKey = current.taskKey;
    if (entityType === 'labs') restoredData.labKey = current.labKey;
    if (entityType === 'meetings') restoredData.meetingKey = current.meetingKey;

    const restored = db[entityType].update(current.id, restoredData);
    db.versions.finalizeLatest(entityType, current.id);
    db.versions.record(entityType, current.id, restored, req.auth.user.id, { summary: `Восстановлена версия ${snapshot.version}`, finalized: true });
    res.json(sanitizeItem(entityType, restored, req.auth.user));
  });
};
