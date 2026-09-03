// Инструменты — каталог полезных ссылок с древовидной структурой папок.

Views._toolsFolder = 'all';

Views.tools = async function () {
  setTopbar(`<h1>Инструменты</h1><div class="actions"><button class="ui-button btn" data-command="openResourceFolderModal" data-command-arg="tools">+ Создать папку</button><button class="ui-button ui-button--primary btn btn-primary" data-command="openToolModal">+ Добавить инструмент</button></div>`);
  const view = document.getElementById('view');
  const [tools, folders] = await Promise.all([Resources.tools.list(), Resources.toolFolders.list()]);
  const selected = Views._toolsFolder;
  const selectedFolder = folders.find((f) => f.id === selected);
  const filtered = selected === 'all' ? tools : tools.filter((d) => d.folderId === selected);
  view.innerHTML = resourceFolderLayoutHtml('tools', folders, tools, selected, selectedFolder, filtered, toolRowHtml, 'инструмент','инструмента','инструментов');
};

const openToolModal = (id) => openLinkResourceModal('tools', id);
async function deleteTool(id) { if (!(await confirmAction('Удалить инструмент из списка?'))) return; await Resources.tools.remove(id); Modal.close(); toast('Удалено'); Views.tools(); }
FeatureLoader.register({ openToolModal, deleteTool });
