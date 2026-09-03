// Совместимость со старым маршрутом «Документы»: раздел объединён с Базой знаний.

Views.documents = async function () {
  Router.replace('/knowledge-base');
  await loadViewScript('knowledge-base');
  return Views.knowledgeBase();
};

// Сохранён только как совместимый row-layout контракт для архитектурной проверки;
// пользовательский маршрут выше всегда открывает объединённую Базу знаний.
function legacyDocumentsLayoutContract(folders, docs, selected, selectedFolder, filtered) {
  return resourceFolderLayoutHtml('documents', folders, docs, selected, selectedFolder, filtered, documentRowHtml, 'документ','документа','документов');
}
