'use strict';

module.exports = function registerCollaborationRoutes(app, { db, canReadItem, denied }) {
  // Личные заметки к задаче — видны только их автору (не общий комментарий),
  // поэтому каждый роут ниже дополнительно фильтрует по userId.
  function loadReadableTask(req, res) {
    const task = db.tasks.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    if (!canReadItem('tasks', task, req.auth.user)) {
      denied(res);
      return null;
    }
    return task;
  }

  function loadOwnNote(req, res, task) {
    const note = db.taskNotes.get(req.params.noteId);
    if (!note || note.taskId !== task.id || note.userId !== req.auth.user.id) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    return note;
  }

  function ownNotesOf(taskId, userId) {
    return db.taskNotes.related(taskId).filter((item) => item.userId === userId);
  }

  app.get('/api/tasks/:id/personal-notes', (req, res) => {
    const task = loadReadableTask(req, res);
    if (!task) return;

    const notes = ownNotesOf(task.id, req.auth.user.id).sort((a, b) => {
      const orderA = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 999999;
      const orderB = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 999999;
      return orderA - orderB || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    res.json(notes);
  });

  app.post('/api/tasks/:id/personal-notes', (req, res) => {
    const task = loadReadableTask(req, res);
    if (!task) return;

    const noteText = String(req.body?.text || '').slice(0, 20000);
    if (!noteText.trim()) return res.status(400).json({ error: 'text_required' });

    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Number(req.body.sortOrder)
      : ownNotesOf(task.id, req.auth.user.id).length;
    res.status(201).json(db.taskNotes.create({ taskId: task.id, userId: req.auth.user.id, text: noteText, sortOrder }));
  });

  app.put('/api/tasks/:id/personal-notes/:noteId', (req, res) => {
    const task = loadReadableTask(req, res);
    if (!task) return;
    const note = loadOwnNote(req, res, task);
    if (!note) return;

    const patch = { text: String(req.body?.text || '').slice(0, 20000) };
    if (Number.isFinite(Number(req.body?.sortOrder))) patch.sortOrder = Number(req.body.sortOrder);
    res.json(db.taskNotes.update(note.id, patch));
  });

  app.delete('/api/tasks/:id/personal-notes/:noteId', (req, res) => {
    const task = loadReadableTask(req, res);
    if (!task) return;
    const note = loadOwnNote(req, res, task);
    if (!note) return;

    db.taskNotes.remove(note.id);
    res.status(204).end();
  });
};
