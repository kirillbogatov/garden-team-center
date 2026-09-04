'use strict';

module.exports = function registerCommentRoutes(app, { db, canReadItem, denied }) {
  const entityConfig = {
    task: { collection: 'tasks' },
    meeting: { collection: 'meetings' },
    project: { collection: 'projects' },
    person: { collection: 'people' },
    lab: { collection: 'labs', validate: (item) => item && item.entityType !== 'idea' },
    overview: { synthetic: true },
  };

  function resolveEntity(type, id) {
    const config = entityConfig[type];
    if (!config) return null;
    if (config.synthetic) {
      if (type !== 'overview' || String(id) !== 'main') return null;
      return { config, item: { id: 'main' } };
    }
    const item = db[config.collection].get(id);
    if (!item || (config.validate && !config.validate(item))) return null;
    return { config, item };
  }
  function canRead(resolved, user) {
    if (resolved.config.synthetic) return Boolean(user);
    return canReadItem(resolved.config.collection, resolved.item, user);
  }
  function publicComment(comment, user) { return { ...comment, canEdit: comment.createdByUserId === user.id }; }

  function list(type) {
    return (req, res) => {
      const resolved = resolveEntity(type || String(req.params.entityType || '').toLowerCase(), req.params.entityId || req.params.id);
      if (!resolved) return res.status(404).json({ error: 'not_found' });
      if (!canRead(resolved, req.auth.user)) return denied(res);
      const entityType = type || String(req.params.entityType || '').toLowerCase();
      res.json(db.comments.related(`${entityType}:${resolved.item.id}`)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map((comment) => publicComment(comment, req.auth.user)));
    };
  }

  function create(type) {
    return (req, res) => {
      const entityType = type || String(req.params.entityType || '').toLowerCase();
      const resolved = resolveEntity(entityType, req.params.entityId || req.params.id);
      if (!resolved) return res.status(404).json({ error: 'not_found' });
      if (!canRead(resolved, req.auth.user)) return denied(res);
      const text = String(req.body?.text || '').trim().slice(0, 10000);
      if (!text) return res.status(400).json({ error: 'text_required' });
      const stickyColors = new Set(['yellow', 'pink', 'blue', 'green']);
      const color = ['overview', 'task', 'meeting', 'project', 'person'].includes(entityType) && stickyColors.has(String(req.body?.color || '')) ? String(req.body.color) : 'yellow';
      const comment = db.comments.create({
        entityType, entityId: resolved.item.id, text, color,
        createdByUserId: req.auth.user.id,
        authorPersonId: req.auth.user.personId || null,
        authorDisplayName: req.auth.user.displayName || req.auth.user.username || 'Сотрудник',
      });
      res.status(201).json(publicComment(comment, req.auth.user));
    };
  }

  function update(req, res) {
    const comment = db.comments.get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'not_found' });
    const resolved = resolveEntity(comment.entityType, comment.entityId);
    if (!resolved || !canRead(resolved, req.auth.user)) return denied(res);
    if (comment.createdByUserId !== req.auth.user.id) return denied(res);
    const rawText = String(req.body?.text ?? comment.text ?? '').slice(0, 10000);
    const noteEntity = ['overview', 'task', 'meeting', 'project', 'person'].includes(comment.entityType);
    const text = noteEntity ? rawText : rawText.trim();
    if (!noteEntity && !text) return res.status(400).json({ error: 'text_required' });
    const patch = { text };
    if (['overview', 'task', 'meeting', 'project', 'person'].includes(comment.entityType) && req.body && Object.prototype.hasOwnProperty.call(req.body, 'color')) {
      const stickyColors = new Set(['yellow', 'pink', 'blue', 'green']);
      if (stickyColors.has(String(req.body.color))) patch.color = String(req.body.color);
    }
    res.json(publicComment(db.comments.update(comment.id, patch), req.auth.user));
  }

  function remove(req, res) {
    const comment = db.comments.get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'not_found' });
    const resolved = resolveEntity(comment.entityType, comment.entityId);
    if (!resolved || !canRead(resolved, req.auth.user)) return denied(res);
    if (comment.createdByUserId !== req.auth.user.id) return denied(res);
    db.comments.remove(comment.id);
    res.status(204).end();
  }

  app.get('/api/comments/:entityType/:entityId', list(null));
  app.post('/api/comments/:entityType/:entityId', create(null));
  app.put('/api/comments/:id', update);
  app.delete('/api/comments/:id', remove);
};
