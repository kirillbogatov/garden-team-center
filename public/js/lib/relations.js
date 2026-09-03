// Unified relation facade for entity links currently stored on entity records.
// Views do not need to know whether a relation is represented by a scalar,
// an id array or a foreign key on the related entity.
const Relations = {
  ids(entity, relation) {
    if (!entity) return [];
    if (relation === 'task.goals') return [...new Set([...(entity.goalIds || []), entity.goalId].filter(Boolean))];
    if (relation === 'task.issues') return [...new Set(entity.issueIds || [])];
    return [];
  },

  resolve(entity, relation, collection) {
    const ids = new Set(Relations.ids(entity, relation));
    return (collection || []).filter((item) => ids.has(item.id));
  },

  labIdeas(project, labs) {
    if (!project) return [];
    return (labs || []).filter((item) => item.entityType === 'idea' && item.labProjectId === project.id);
  },

  taskPatch(relation, ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (relation === 'task.goals') return { goalId: unique[0] || null, goalIds: unique };
    if (relation === 'task.issues') return { issueIds: unique };
    return {};
  },
};
