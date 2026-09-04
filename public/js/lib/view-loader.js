// Native ES-module feature loader without a build pipeline.
// Views are isolated modules loaded on demand. Public feature commands are
// registered explicitly instead of being exposed through window.* globals.
const VIEW_BASE_URL = new URL('../views/', document.currentScript.src);
const _loadedViewScripts = new Set();
const _loadingViewScripts = new Map();
const _featureCommands = new Map();

const ACTION_FEATURES = {
  openAgreementModal: 'agreements',
  openIssueModal: 'issues',
  openJournalEditModal: 'journal',
  deleteJournalEntry: 'journal',
  openLabIdeaModal: 'labs',
  openLabModal: 'labs',
  openMeetingModal: 'meetings',
  openPersonLoadModal: 'projects',
  openDocumentModal: 'documents',
  openToolModal: 'tools',
  openProcessModal: 'processes',
  openTaskModal: 'tasks',
  openCheckinModal: 'checkins',
  openCheckinsWeekPicker: 'checkins',
  openCheckinsExportModal: 'checkins',
};

function loadViewScript(name) {
  if (_loadedViewScripts.has(name)) return Promise.resolve();
  if (_loadingViewScripts.has(name)) return _loadingViewScripts.get(name);
  const url = new URL(`${name}.js`, VIEW_BASE_URL);
  const promise = import(url.href)
    .then(() => { _loadedViewScripts.add(name); _loadingViewScripts.delete(name); })
    .catch((error) => { _loadingViewScripts.delete(name); throw new Error(`Не удалось загрузить feature: ${name}`, { cause: error }); });
  _loadingViewScripts.set(name, promise);
  return promise;
}

async function loadViewScripts(names) {
  await Promise.all((names || []).map(loadViewScript));
}

const FeatureLoader = {
  load: loadViewScript,
  loadAll: loadViewScripts,
  isLoaded: (name) => _loadedViewScripts.has(name),
  register(commands) {
    for (const [name, handler] of Object.entries(commands || {})) {
      if (typeof handler === 'function') _featureCommands.set(name, handler);
    }
  },
  canRun(name) {
    return _featureCommands.has(name) || Boolean(ACTION_FEATURES[name]);
  },
  async run(name, ...args) {
    if (!_featureCommands.has(name)) {
      const feature = ACTION_FEATURES[name];
      if (feature) await loadViewScript(feature);
    }
    const handler = _featureCommands.get(name);
    if (typeof handler !== 'function') throw new Error(`Feature command is unavailable: ${name}`);
    return handler(...args);
  },
};
