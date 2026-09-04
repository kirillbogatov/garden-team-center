// Domain/service facade. Views use semantic resource objects rather than URLs.
const Resources = Object.fromEntries([
  'tasks','labs','projects','goals','issues','meetings','people','agreements','journal',
  'documents','tools','processes','vacations','kbFolders','kbDocs','docFolders','toolFolders','checkins'
].map((name) => [name, api.resource(`/api/${name}`)]));

const Comments = {
  list: (entityType, entityId) => api.get(`/api/comments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`),
  create: (entityType, entityId, data) => api.post(`/api/comments/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, data),
  update: (id, data) => api.put(`/api/comments/${encodeURIComponent(id)}`, data),
  remove: (id) => api.del(`/api/comments/${encodeURIComponent(id)}`),
};

const LabService = {
  async detail(ref) {
    const lab = await Resources.labs.get(ref);
    const [allLabs, comments] = await Promise.all([Resources.labs.list(), Comments.list('lab', lab.id)]);
    const ideas = Relations.labIdeas(lab, allLabs)
      .sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return { lab, ideas, comments };
  },
};

const TaskService = {
  async detail(id, taskRecord) {
    const taskPromise = taskRecord ? Promise.resolve(taskRecord) : Resources.tasks.get(id);
    const [task, goals, issues, personalNotes, comments] = await Promise.all([
      taskPromise,
      Resources.goals.list(),
      Resources.issues.list(),
      api.get(`/api/tasks/${encodeURIComponent(id)}/personal-notes`),
      Comments.list('task', id).catch(() => []),
    ]);
    return { task, goals, issues, personalNotes, comments };
  },
  archive: (id) => Resources.tasks.update(id, { archivedAt: new Date().toISOString() }),
  restore: (id) => Resources.tasks.update(id, { archivedAt: null }),
};


const Versions = {
  list: (entityType, entityId) => api.get(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`),
  restore: (entityType, entityId, version) => api.post(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(version)}/restore`, {}),
  finalize: (entityType, entityId) => api.post(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/finalize`, {}),
  remove: (entityType, entityId, version) => api.del(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(version)}`),
};
