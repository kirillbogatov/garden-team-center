'use strict';

module.exports = function registerNotificationRoutes(app, deps) {
  const { db, ensureCheckinReminder } = deps;

  app.get('/api/notifications', (req, res) => {
    ensureCheckinReminder(db, req.auth.user);
    const items = db.notifications.list(req.auth.user.id, req.query.limit || 50);
    res.json({ items, unreadCount: db.notifications.unreadCount(req.auth.user.id) });
  });

  app.put('/api/notifications/:id/read', (req, res) => {
    const ok = db.notifications.markRead(req.auth.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, unreadCount: db.notifications.unreadCount(req.auth.user.id) });
  });

  app.post('/api/notifications/read-all', (req, res) => {
    db.notifications.markAllRead(req.auth.user.id);
    res.json({ ok: true, unreadCount: 0 });
  });
};
