'use strict';

// Workspace-wide (not per-user) settings, currently just the task
// auto-archive window. Lives on its own so it can be created before both
// registerSettingsRoutes (which exposes it over HTTP) and createTaskAutoArchive
// (which reads it on a timer) — neither has to wait on the other.
const DEFAULT_WORKSPACE_SETTINGS = { taskAutoArchiveDays: 14 };

function normalizeWorkspaceSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const days = Number(source.taskAutoArchiveDays);
  return {
    taskAutoArchiveDays: Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : DEFAULT_WORKSPACE_SETTINGS.taskAutoArchiveDays,
  };
}

module.exports = function createWorkspaceSettings({ db }) {
  function workspaceSettings() {
    return normalizeWorkspaceSettings(db.meta.get('workspace_settings', DEFAULT_WORKSPACE_SETTINGS));
  }
  function setWorkspaceSettings(patch) {
    const next = normalizeWorkspaceSettings({ ...workspaceSettings(), ...(patch || {}) });
    db.meta.set('workspace_settings', next);
    return next;
  }

  return { DEFAULT_WORKSPACE_SETTINGS, normalizeWorkspaceSettings, workspaceSettings, setWorkspaceSettings };
};
