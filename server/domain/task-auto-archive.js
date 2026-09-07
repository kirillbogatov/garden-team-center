'use strict';

module.exports = function createTaskAutoArchive({ db, workspaceSettings }) {
  function autoArchiveCompletedTasks() {
    const days = workspaceSettings().taskAutoArchiveDays;
    const cutoff = Date.now() - days * 86400000;
    const nowIso = new Date().toISOString();
    let count = 0;
    for (const task of db.tasks.all()) {
      if (task.status !== 'done') continue;
      const completedAt = task.completedAt || task.updatedAt || task.createdAt;
      const completedMs = Date.parse(completedAt || '');
      if (!Number.isFinite(completedMs)) continue;
      if (!task.completedAt) db.tasks.update(task.id, { completedAt });
      if (completedMs <= cutoff) {
        db.tasks.update(task.id, { archivedAt: nowIso, completedAt });
        count += 1;
      }
    }
    return count;
  }

  function startAutoArchiveTimer(intervalMs = 60 * 60 * 1000) {
    const timer = setInterval(autoArchiveCompletedTasks, intervalMs);
    if (timer.unref) timer.unref();
    return timer;
  }

  return { autoArchiveCompletedTasks, startAutoArchiveTimer };
};
