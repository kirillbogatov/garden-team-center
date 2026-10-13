'use strict';

module.exports = function registerCommentRoutes(app, { db, canReadItem, denied, isAdmin, resolveEntity: resolvePublicEntity }) {
  const entityConfig = {
    task: { collection: 'tasks' },
    // A separate discussion thread on the same task ("Комментарии", like The
    // Labs projects have) — independent from the sticky notes above. Both
    // resolve/permission-check against the same task, but store their rows
    // under different entityType keys so they never mix.
    'task-discussion': { collection: 'tasks' },
    meeting: { collection: 'meetings' },
    project: { collection: 'projects' },
    person: { collection: 'people' },
    goal: { collection: 'goals' },
    lab: { collection: 'labs', validate: (item) => item && item.entityType !== 'idea' },
    overview: { synthetic: true },
  };

  // These entity types use "comments" as sticky notes (color, free editing)
  // rather than a plain discussion thread — see noteEntity/patch.color below.
  const STICKY_ENTITY_TYPES = ['overview', 'task', 'meeting', 'project', 'person', 'lab', 'goal'];
  const STICKY_COLORS = new Set(['yellow', 'pink', 'blue', 'green']);
  const isStickyEntity = (entityType) => STICKY_ENTITY_TYPES.includes(entityType);
  const sanitizeStickyColor = (candidate) => (STICKY_COLORS.has(String(candidate || '')) ? String(candidate) : null);

  function resolveEntity(type, id) {
    const config = entityConfig[type];
    if (!config) return null;
    if (config.synthetic) {
      if (type !== 'overview' || String(id) !== 'main') return null;
      return { config, item: { id: 'main' } };
    }
    const item = typeof resolvePublicEntity === 'function' ? resolvePublicEntity(config.collection, id) : db[config.collection].get(id);
    if (!item || (config.validate && !config.validate(item))) return null;
    return { config, item };
  }

  function canRead(resolved, user) {
    if (resolved.config.synthetic) return Boolean(user);
    return canReadItem(resolved.config.collection, resolved.item, user);
  }

  function publicComment(comment, user) {
    return { ...comment, canEdit: comment.createdByUserId === user.id };
  }

  function list(type) {
    return (req, res) => {
      const entityType = type || String(req.params.entityType || '').toLowerCase();
      const resolved = resolveEntity(entityType, req.params.entityId || req.params.id);
      if (!resolved) return res.status(404).json({ error: 'not_found' });
      if (!canRead(resolved, req.auth.user)) return denied(res);

      const comments = db.comments.related(`${entityType}:${resolved.item.id}`)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map((comment) => publicComment(comment, req.auth.user));
      res.json(comments);
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

      const color = (isStickyEntity(entityType) && sanitizeStickyColor(req.body?.color)) || 'yellow';
      const comment = db.comments.create({
        entityType,
        entityId: resolved.item.id,
        text,
        color,
        createdByUserId: req.auth.user.id,
        authorPersonId: req.auth.user.personId || null,
        authorDisplayName: req.auth.user.displayName || req.auth.user.username || 'Сотрудник',
      });
      res.status(201).json(publicComment(comment, req.auth.user));
    };
  }

  // Update/delete share the same ownership rule: the author always may, and
  // an admin may on top of that — mirroring the all_manage override every
  // other collection's canDelete/canUpdate already gives admins.
  function canModify(comment, user) {
    return comment.createdByUserId === user.id || isAdmin(user);
  }

  function loadModifiableComment(req, res) {
    const comment = db.comments.get(req.params.id);
    if (!comment) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    const resolved = resolveEntity(comment.entityType, comment.entityId);
    if (!resolved || !canRead(resolved, req.auth.user)) {
      denied(res);
      return null;
    }
    if (!canModify(comment, req.auth.user)) {
      denied(res);
      return null;
    }
    return comment;
  }

  function update(req, res) {
    const comment = loadModifiableComment(req, res);
    if (!comment) return;

    const rawText = String(req.body?.text ?? comment.text ?? '').slice(0, 10000);
    const stickyEntity = isStickyEntity(comment.entityType);
    const text = stickyEntity ? rawText : rawText.trim();
    if (!stickyEntity && !text) return res.status(400).json({ error: 'text_required' });

    const patch = { text };
    if (stickyEntity && req.body && Object.prototype.hasOwnProperty.call(req.body, 'color')) {
      const color = sanitizeStickyColor(req.body.color);
      if (color) patch.color = color;
    }
    res.json(publicComment(db.comments.update(comment.id, patch), req.auth.user));
  }

  function remove(req, res) {
    const comment = loadModifiableComment(req, res);
    if (!comment) return;

    db.comments.remove(comment.id);
    res.status(204).end();
  }

  app.get('/api/comments/:entityType/:entityId', list(null));
  app.post('/api/comments/:entityType/:entityId', create(null));
  app.put('/api/comments/:id', update);
  app.delete('/api/comments/:id', remove);
};
