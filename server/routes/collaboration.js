'use strict';

module.exports = function registerCollaborationRoutes(app, { db, canReadItem, denied }) {
  // ---------- Task personal notes ----------
  app.get('/api/tasks/:id/personal-notes', (req, res) => {
    const task = db.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('tasks', task, req.auth.user)) return denied(res);
    const notes = db.taskNotes.related(task.id)
      .filter((item) => item.userId === req.auth.user.id)
      .sort((a, b) => (Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 999999) - (Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 999999) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    res.json(notes);
  });
  
  app.post('/api/tasks/:id/personal-notes', (req, res) => {
    const task = db.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('tasks', task, req.auth.user)) return denied(res);
    const noteText = String(req.body?.text || '').slice(0, 20000);
    if (!noteText.trim()) return res.status(400).json({ error: 'text_required' });
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : db.taskNotes.related(task.id).filter((item) => item.userId === req.auth.user.id).length;
    return res.status(201).json(db.taskNotes.create({ taskId: task.id, userId: req.auth.user.id, text: noteText, sortOrder }));
  });
  
  app.put('/api/tasks/:id/personal-notes/:noteId', (req, res) => {
    const task = db.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('tasks', task, req.auth.user)) return denied(res);
    const note = db.taskNotes.get(req.params.noteId);
    if (!note || note.taskId !== task.id || note.userId !== req.auth.user.id) return res.status(404).json({ error: 'not_found' });
    const noteText = String(req.body?.text || '').slice(0, 20000);
    const patch = { text: noteText };
    if (Number.isFinite(Number(req.body?.sortOrder))) patch.sortOrder = Number(req.body.sortOrder);
    return res.json(db.taskNotes.update(note.id, patch));
  });
  
  app.delete('/api/tasks/:id/personal-notes/:noteId', (req, res) => {
    const task = db.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'not_found' });
    if (!canReadItem('tasks', task, req.auth.user)) return denied(res);
    const note = db.taskNotes.get(req.params.noteId);
    if (!note || note.taskId !== task.id || note.userId !== req.auth.user.id) return res.status(404).json({ error: 'not_found' });
    db.taskNotes.remove(note.id);
    return res.status(204).end();
  });
};
