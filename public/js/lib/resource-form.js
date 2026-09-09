// Shared create/edit form for link-based resources (Documents and Tools).
async function openLinkResourceModal(kind, id) {
  const configs = {
    tools: { resource: Resources.tools, folders: Resources.toolFolders, state: '_toolsFolder', render: 'tools', title: 'инструмент' },
  };
  const cfg = configs[kind];
  if (!cfg) throw new Error(`Unknown link resource: ${kind}`);

  const isEdit = Boolean(id);
  const [item, folders] = await Promise.all([
    isEdit ? cfg.resource.get(id) : Promise.resolve({}),
    cfg.folders.list(),
  ]);
  const defaultFolder = item.folderId || (Views[cfg.state] !== 'all' ? Views[cfg.state] : '');
  const value = { ...item, folderId: defaultFolder };

  const schema = [
    { key: 'title', label: 'Название', type: 'text', trim: true },
    { key: 'url', label: 'Ссылка', type: 'url', trim: true, placeholder: 'https://…' },
    {
      key: 'folderId',
      label: 'Папка',
      render: ({ id: controlId, value: selected }) => `<select id="${controlId}"><option value="">Без папки</option>${resourceFolderOptionsHtml(folders, selected)}</select>`,
      parse: (v) => v || null,
    },
  ];

  EntityForm.open({
    title: isEdit ? `Редактировать ${cfg.title}` : `Новый ${cfg.title}`,
    mode: isEdit ? 'edit' : 'create',
    value,
    schema,
    validate: (payload) => (!payload.title || !payload.url) ? 'Укажите название и ссылку' : '',
    onSave: async (payload) => {
      // Схема выше не объявляет теги — оставшееся поле tags может прийти
      // только из старых записей и не должно перезаписываться формой.
      delete payload.tags;
      if (isEdit) await cfg.resource.update(item.id, payload);
      else await cfg.resource.create(payload);
      Modal.close();
      toast('Сохранено');
      Views[cfg.render]();
    },
    onDelete: isEdit ? async () => {
      if (!(await confirmAction(`Удалить ${cfg.title} из списка?`))) return;
      await cfg.resource.remove(item.id);
      Modal.close();
      toast('Удалено');
      Views[cfg.render]();
    } : null,
  });
}
