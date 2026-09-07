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
    res.json(engine.smartSearch(query, req.auth.user, {
      personId,
      hints: settings.smartSearchPersonHints || {},
      // Сценарий «Чем заняться сегодня» ранжирует задачи по стратегии из настроек —
      // той же, что выбирает порядок в виджетах Обзора.
      taskPriorityMode: settings.taskPriorityMode,
    }));
  });

  return engine;
};
