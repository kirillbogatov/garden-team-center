// Shared goal/lab growth domain math (pure, no SVG rendering — see goal-tree.js for the art generator).
export function goalProgress(goal, tasks = []) {
  if (!goal) return 0;
  const taskList = Array.isArray(tasks) ? tasks : [];
  const taskIds = Array.isArray(goal.taskIds) ? goal.taskIds : [];
  const linked = taskList.filter((task) => task && (
    taskIds.includes(task.id)
    || task.goalKey === goal.goalKey
    || (Array.isArray(task.goalKeys) && task.goalKeys.includes(goal.goalKey))
  ));
  if (!linked.length) return 0;
  const done = linked.filter((task) => task.status === 'done').length;
  return Math.round((done / linked.length) * 100);
}

export function goalTreeStage(progress) {
  return Math.max(0, Math.min(9, Math.floor(progress / 10)));
}
