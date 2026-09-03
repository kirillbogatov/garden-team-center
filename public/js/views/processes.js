// Процессы — что и как мы делаем, где сломано и как чинить.

Views.processes = async function () {
  setTopbar(`<h1>Процессы</h1>${Auth.canCreate('processes') ? `<div class="actions"><button class="ui-button ui-button--primary btn btn-primary" data-command="openProcessModal">+ Добавить процесс</button></div>` : ''}`);
  const view = document.getElementById('view');
  const processes = await Resources.processes.list();
  if (!processes.length) { view.innerHTML = emptyState('Процессы ещё не описаны', '', 'processes'); return; }

  const broken = processes.filter((p) => p.status === 'broken');
  const attention = processes.filter((p) => p.status === 'attention');
  const ok = processes.filter((p) => p.status === 'ok' || !p.status);

  view.innerHTML = `
    <div class="view-narrow">
      ${broken.length ? `<h2 class="section-title mt-0" style="color:var(--red)">${icon('issues', 15)} Сломано (${broken.length})</h2>${broken.map(processCardHtml).join('')}` : ''}
      ${attention.length ? `<h2 class="section-title ${broken.length ? '' : 'mt-0'}" style="color:var(--orange)">${icon('issues', 15)} Есть замечания (${attention.length})</h2>${attention.map(processCardHtml).join('')}` : ''}
      <h2 class="section-title ${!broken.length && !attention.length ? 'mt-0' : ''}">${icon('processes', 15)} В порядке</h2>
      ${ok.length ? ok.map(processCardHtml).join('') : `<div class="tiny">Нет процессов без нареканий</div>`}
    </div>
  `;
};

async function openProcessModal(id) {
  const isEdit = Boolean(id);
  const process = isEdit ? await Resources.processes.get(id) : {};
  const editable = !isEdit || Auth.canEditItem('processes', process);
  EntityForm.open({
    title: isEdit ? 'Редактировать процесс' : 'Новый процесс',
    mode: isEdit ? 'edit' : 'create',
    value: { ...process },
    editable,
    schema: [
      { key: 'title', label: 'Название', type: 'text', trim: true },
      { key: 'description', label: 'Как это работает', type: 'textarea', rows: 2, trim: true },
      { key: 'status', label: 'Статус', type: 'select', default: 'ok', options: [{ value: 'ok', label: 'Работает' }, { value: 'attention', label: 'Есть замечания' }, { value: 'broken', label: 'Сломан' }] },
      { key: 'brokenNote', label: 'В чём проблема (если сломан)', type: 'textarea', rows: 2, trim: true },
      { key: 'fixPlan', label: 'Как планируем починить', type: 'textarea', rows: 2, trim: true },
      { key: 'ownerId', label: 'Ответственный', type: 'people', multi: false, people: () => store.team(), placeholder: 'Не назначен' },
    ],
    validate: (payload) => !payload.title ? 'Укажите название процесса' : '',
    onSave: async (payload) => {
      delete payload.tags;
      if (isEdit) await Resources.processes.update(process.id, payload); else await Resources.processes.create(payload);
      Modal.close(); toast('Сохранено'); Views.processes();
    },
    onDelete: isEdit && editable ? () => deleteProcess(process.id) : null,
  });
}

async function deleteProcess(id) {
  const ok = await confirmAction('Удалить описание процесса?');
  if (!ok) return;
  await Resources.processes.remove(id);
  Modal.close();
  toast('Удалено');
  Views.processes();
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openProcessModal });
