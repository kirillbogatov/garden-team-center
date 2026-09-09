'use strict';

const createSmartSearch = require('../domain/smart-search');

module.exports = function registerSmartSearchRoutes(app, { db, visibleItems, search, isTeamlead, normalizeUserSettings }) {
  const engine = createSmartSearch({ db, visibleItems, search, isTeamlead });

  // Запомненные пользователем разрешения неоднозначных имён («маша» → конкретный человек)
  // живут в его же настройках, поэтому читаются здесь, а не приходят с клиента:
  // так подсказку нельзя подделать запросом и она одинаково работает на всех устройствах.
  function userSettings(user) {
    try {
      return normalizeUserSettings(db.auth.preferences.get(user.id));
    } catch (_) {
      return {};
    }
  }

  app.get('/api/smart-search', (req, res) => {
    const query = (req.query.q || '').toString();
    const personId = (req.query.personId || '').toString() || null;
    const settings = userSettings(req.auth.user);
    const result = engine.smartSearch(query, req.auth.user, {
      personId,
      hints: settings.smartSearchPersonHints || {},
      // Сценарий «Чем заняться сегодня» ранжирует задачи по стратегии из настроек —
      // той же, что выбирает порядок в виджетах Обзора.
      taskPriorityMode: settings.taskPriorityMode,
    });
    // «Умный поиск» здесь — не структурированная команда, а обычный fallback-поиск
    // (kind: 'search' без распознанного command) — та же статистика непонятых
    // запросов, что и у обычного поиска, тем же логгером, чтобы не разъезжаться.
    if (result && result.kind === 'search') search.logSearchMissIfUnrecognized(result.search, req.auth.user);
    res.json(result);
  });

  return engine;
};
