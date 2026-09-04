'use strict';

// No external dependencies beyond its arguments, so this is a plain export
// rather than a createXxx({...}) factory (see task-auto-archive.js and
// teamlead-sync.js for the factory-style domain modules).
function taskLifecyclePatch(current, patch) {
  const next = { ...(patch || {}) };
  if (!Object.prototype.hasOwnProperty.call(next, 'status')) return next;
  const previousStatus = current?.status || null;
  const newStatus = next.status;
  if (newStatus === 'done') {
    if (!current?.completedAt || previousStatus !== 'done') next.completedAt = new Date().toISOString();
  } else if (previousStatus === 'done') {
    next.completedAt = null;
  }
  return next;
}

module.exports = { taskLifecyclePatch };
