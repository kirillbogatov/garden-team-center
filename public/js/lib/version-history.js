function versionHistoryValue(entityType, data) {
  if (entityType === 'meetings') {
    const type = MEETING_TYPE_LABEL?.[data.type || 'other'] || data.type || 'Встреча';
    return `${escapeHtml(data.title || 'Встреча')}<span class="version-history-meta-value">${escapeHtml(type)}${data.date ? ` · ${escapeHtml(fmtDate(data.date))}` : ''}</span>`;
  }
  if (entityType === 'tasks') {
    const status = TASK_STATUS_LABEL[data.status || 'todo'] || data.status || '';
    return `${escapeHtml(data.title || 'Без названия')}<span class="version-history-meta-value">${escapeHtml(status)}</span>`;
  }
  const status = LAB_STATUS_LABEL?.[data.status || 'idea'] || data.status || '';
  return `${escapeHtml(data.title || 'Без названия')}<span class="version-history-meta-value">${escapeHtml(status)}</span>`;
}

function versionHistoryDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function openVersionHistory(entityType, entity, options) {
  const opts = options || {};
  const entityId = entity?.id;
  if (!entityId) return;
  let versions;
  try {
    versions = await Versions.list(entityType, entityId);
  } catch (error) {
    console.error(error);
    toast('Не удалось загрузить историю версий');
    return;
  }
  const currentVersion = versions.find((entry) => entry.current)?.version ?? versions[0]?.version;
  Modal.open(`
    <div class="version-history-head">
      <div><h2>История версий</h2><div class="tiny muted">${escapeHtml(entityType === 'tasks' ? entity.taskKey || '' : entityType === 'meetings' ? entity.meetingKey || '' : entity.labKey || '')}</div></div>
    </div>
    <div class="version-history-list">
      ${versions.length ? versions.map((entry) => `
        <div class="version-history-row ${entry.version === currentVersion ? 'is-current' : ''}">
          <div class="version-history-copy">
            <div class="version-history-title"><strong>Версия ${entry.version}</strong>${entry.version === currentVersion ? '<span class="ui-tag badge">Текущая</span>' : ''}</div>
            <div class="version-history-preview">${versionHistoryValue(entityType, entry.data || {})}</div>
            <div class="version-history-meta">${escapeHtml(versionHistoryDate(entry.createdAt))}${entry.authorName ? ` · ${escapeHtml(entry.authorName)}` : ''}</div>
          </div>
          ${entry.version === currentVersion || opts.canRestore === false ? '' : `
            <div class="version-history-actions">
              <button type="button" class="ui-button btn btn-sm" data-version-restore="${entry.version}">Откатиться</button>
              <button type="button" class="ui-button btn btn-sm btn-danger-subtle" data-version-delete="${entry.version}">Удалить</button>
            </div>`}
        </div>`).join('') : '<div class="empty-state">История пока пуста</div>'}
    </div>
    <div class="ui-modal-actions modal-actions"><button type="button" class="ui-button btn" data-modal-close>Закрыть</button></div>
  `, { label: 'История версий' });


  Modal.panel()?.querySelectorAll('[data-version-delete]').forEach((button) => {
    button.onclick = async () => {
      const version = Number(button.dataset.versionDelete);
      const ok = await confirmAction(`Удалить версию ${version}? Это действие нельзя отменить.`);
      if (!ok) return;
      button.disabled = true;
      try {
        await Versions.remove(entityType, entityId, version);
        button.closest('.version-history-row')?.remove();
        toast(`Версия ${version} удалена`);
      } catch (error) {
        console.error(error);
        button.disabled = false;
        toast(error?.status === 409 ? 'Текущую версию удалить нельзя' : 'Не удалось удалить версию');
      }
    };
  });

  Modal.panel()?.querySelectorAll('[data-version-restore]').forEach((button) => {
    button.onclick = async () => {
      const version = Number(button.dataset.versionRestore);
      const ok = await confirmAction(`Откатить элемент к версии ${version}? Текущее состояние останется в истории.`);
      if (!ok) return;
      button.disabled = true;
      try {
        await Versions.restore(entityType, entityId, version);
        Modal.close();
        await store.loadAll();
        toast(`Восстановлена версия ${version}`);
        Router.render();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        toast('Не удалось восстановить версию');
      }
    };
  });
}
