// Совместимость со старым маршрутом «Документы»: раздел объединён с Базой знаний.

Views.documents = async function () {
  Router.replace('/knowledge-base');
  await loadViewScript('knowledge-base');
  return Views.knowledgeBase();
};

