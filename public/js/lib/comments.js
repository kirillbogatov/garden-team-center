// Shared note/comment UI controller.
function stickyRichTextHtml(text) {
  const escaped = escapeHtml(String(text || ''));
  const lines = escaped.split(/\r?\n/);
  const inline = (value) => value
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(https?:\/\/[^\s<]+)/gi, '<a class="inline-text-link" href="$1" target="_blank" rel="noopener noreferrer" data-stop-propagation="1">$1</a>');
  let html = '';
  let inList = false;
  lines.forEach((line) => {
    const bullet = /^\s*[-•]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(bullet[1])}</li>`;
      return;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += line ? `<div>${inline(line)}</div>` : '<div><br></div>';
  });
  if (inList) html += '</ul>';
  return html;
}

function commentThreadHtml(comments, options = {}) {
  if (!comments?.length) return options.variant === 'notes' ? '' : `<div class="task-comments-empty">Комментариев пока нет</div>`;
  const sticky = options.variant === 'sticky' || options.variant === 'notes';
  const editableNotes = options.variant === 'notes';
  return comments.map((comment) => {
    const person = comment.authorPersonId ? store.person(comment.authorPersonId) : null;
    const avatar = person ? avatarHtml(person) : `<span class="task-comment-avatar-fallback">${escapeHtml((comment.authorDisplayName || '?').trim().charAt(0).toUpperCase())}</span>`;
    if (sticky) {
      const color = ['yellow','pink','blue','green'].includes(comment.color) ? comment.color : 'yellow';
      const id = escapeHtml(comment.id || '');
      const draftClass = comment._draft ? ' is-draft' : '';
      if (editableNotes && comment.canEdit !== false) {
        return `<article class="overview-sticky-note is-${color}${draftClass}" data-entity-comment-id="${id}" data-sticky-color="${color}">
          <div class="overview-sticky-head" title="Перетащить стикер">
            <div class="overview-sticky-formatbar overview-sticky-formatbar-inline"><button type="button" data-note-format="bold"><b>B</b></button><button type="button" data-note-format="italic"><i>I</i></button></div>
            <div class="overview-sticky-actions"><button type="button" class="overview-sticky-color" data-comment-action="color" title="Сменить цвет" aria-label="Сменить цвет"><span></span></button><button type="button" data-comment-action="delete" title="Удалить стикер" aria-label="Удалить стикер">${icon('close', 13)}</button></div>
          </div>
          <textarea class="overview-note-autosave" rows="4" placeholder="Напишите заметку…">${escapeHtml(comment.text || '')}</textarea>
          <div class="overview-sticky-footer"><div class="overview-sticky-meta"><span class="overview-note-save-state">${comment._draft ? '' : fmtRelative(comment.updatedAt || comment.createdAt)}</span></div><button type="button" class="overview-sticky-journal-action" data-comment-action="journal" title="Перенести в журнал" aria-label="Перенести стикер в журнал">${icon('journal', 13)}<span>Перенести в журнал</span></button></div>
        </article>`;
      }
      return `<article class="overview-sticky-note is-${color}" data-entity-comment-id="${id}" data-sticky-color="${color}">
        <div class="overview-sticky-head" title="Перетащить стикер"><div class="overview-sticky-actions">${comment.canEdit ? `<button type="button" class="overview-sticky-color" data-comment-action="color" title="Сменить цвет" aria-label="Сменить цвет"><span></span></button><button type="button" data-comment-action="edit" title="Редактировать" aria-label="Редактировать">${icon('edit', 13)}</button><button type="button" data-comment-action="delete" title="Удалить" aria-label="Удалить">${icon('close', 13)}</button>` : ''}</div></div>
        <div class="overview-sticky-text">${stickyRichTextHtml(comment.text)}</div><div class="overview-sticky-footer"><div class="overview-sticky-meta">${fmtRelative(comment.createdAt)}</div>${comment.canEdit ? `<button type="button" class="overview-sticky-journal-action" data-comment-action="journal" title="Перенести в журнал" aria-label="Перенести стикер в журнал">${icon('journal', 13)}<span>Перенести в журнал</span></button>` : ''}</div>
      </article>`;
    }
    return `<article class="task-comment" data-entity-comment-id="${id}"><div class="task-comment-avatar">${avatar}</div><div class="task-comment-body"><div class="task-comment-head"><strong>${escapeHtml(person?.name || comment.authorDisplayName || 'Сотрудник')}</strong><span>${fmtRelative(comment.createdAt)}</span>${comment.canEdit ? `<span class="task-comment-actions"><button type="button" data-comment-action="edit">Редактировать</button><button type="button" data-comment-action="delete">Удалить</button></span>` : ''}</div><div class="task-comment-text">${renderLinkedText(comment.text)}</div></div></article>`;
  }).join('');
}

function createCommentController(options) {
  const state = {
    entityType: options.entityType, entityId: options.entityId,
    comments: Array.isArray(options.comments) ? options.comments : [],
    listId: options.listId, countId: options.countId,
    inputId: options.inputId, sendId: options.sendId,
    addId: options.addId, variant: options.variant || 'default', color: options.defaultColor || 'yellow',
    suppressEmptyAfterDelete: !!options.suppressEmptyAfterDelete, onChange: options.onChange || null,
    journalPrefix: String(options.journalPrefix || '').trim(),
    onReorder: typeof options.onReorder === 'function' ? options.onReorder : null,
    stickyLayoutKey: `garden:sticky-layout:${options.entityType}:${options.entityId}`,
    stickyOrderKey: `garden:sticky-order:${options.entityType}:${options.entityId}`,
  };
  const baseUrl = `/api/comments/${encodeURIComponent(state.entityType)}/${encodeURIComponent(state.entityId)}`;
  const stickyColors = ['yellow','pink','blue','green'];
  let draftSeq = 0;
  let stickyLayout = (() => {
    try { return localStorage.getItem(state.stickyLayoutKey) === 'two' ? 'two' : 'one'; } catch (_) { return 'one'; }
  })();

  function persistStickyLayout(mode) {
    stickyLayout = mode === 'two' ? 'two' : 'one';
    try { localStorage.setItem(state.stickyLayoutKey, stickyLayout); } catch (_) {}
  }
  function storedStickyOrder() {
    try {
      const value = JSON.parse(localStorage.getItem(state.stickyOrderKey) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) { return []; }
  }
  function persistStickyOrder(order) {
    try { localStorage.setItem(state.stickyOrderKey, JSON.stringify(order)); } catch (_) {}
  }
  function applyStickyOrder() {
    if (state.variant !== 'notes') return;
    const order = storedStickyOrder();
    if (!order.length) return;
    const rank = new Map(order.map((id, index) => [id, index]));
    state.comments.sort((a, b) => {
      if (a._draft && !b._draft) return -1;
      if (!a._draft && b._draft) return 1;
      const ar = rank.has(String(a.id)) ? rank.get(String(a.id)) : Number.MAX_SAFE_INTEGER;
      const br = rank.has(String(b.id)) ? rank.get(String(b.id)) : Number.MAX_SAFE_INTEGER;
      return ar - br;
    });
  }

  function surroundSelection(textarea, before, after = before) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = textarea.value.slice(start, end) || 'текст';
    textarea.setRangeText(`${before}${selected}${after}`, start, end, 'end');
    textarea.focus(); textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function noteDraft() {
    return { id: `draft-${Date.now()}-${++draftSeq}`, text: '', color: 'yellow', canEdit: true, _draft: true };
  }

  const controller = {
    render() {
      applyStickyOrder();
      const list = document.getElementById(state.listId);
      if (list) list.innerHTML = commentThreadHtml(state.comments, { variant: state.variant });
      const count = document.getElementById(state.countId);
      if (count) count.textContent = state.comments.filter((x) => !x._draft).length || '';
      if (state.variant === 'notes') {
        controller.bindNoteEditors();
        controller.bindStickyReorder();
        controller.syncStickyLayout();
      }
    },
    addDraft() {
      const existing = state.comments.find((x) => x._draft && !String(x.text || '').trim());
      if (!existing) state.comments.unshift(noteDraft());
      controller.render();
      document.querySelector(`[data-entity-comment-id="${CSS.escape((existing || state.comments[0]).id)}"] textarea`)?.focus();
    },
    ensureDraft(options = {}) {
      let existing = state.comments.find((x) => x._draft);
      if (!state.comments.length) { existing = noteDraft(); state.comments.push(existing); controller.render(); }
      if (options.focus) document.querySelector(`[data-entity-comment-id="${CSS.escape(existing?.id || '')}"] textarea`)?.focus();
    },
    savedCount() { return state.comments.filter((x) => !x._draft).length; },
    filledCount() { return state.comments.filter((x) => !x._draft && String(x.text || '').trim()).length; },
    syncStickyLayout() {
      if (state.variant !== 'notes') return;
      const list = document.getElementById(state.listId);
      const main = document.querySelector('.main');
      if (!list || !main) return;
      const cardCount = list.querySelectorAll('.overview-sticky-note').length;
      const canFitTwo = window.innerWidth > 980;
      const twoColumns = stickyLayout === 'two' && cardCount > 1 && canFitTwo;
      list.classList.toggle('stickies-two-column', twoColumns);
      main.classList.toggle('stickies-two-column', twoColumns);
    },
    bindStickyReorder() {
      if (state.variant !== 'notes') return;
      const list = document.getElementById(state.listId);
      if (!list) return;
      let dragged = null;
      let dragPreview = null;
      let dragAnchorX = 0;
      let layoutBeforeDrag = stickyLayout;
      let didDrop = false;

      const removeDragPreview = () => {
        dragPreview?.remove();
        dragPreview = null;
      };

      const makeDragPreview = (note, event) => {
        removeDragPreview();
        const rect = note.getBoundingClientRect();
        const clone = note.cloneNode(true);
        clone.classList.remove('is-dragging');
        clone.classList.add('overview-sticky-drag-preview');
        clone.removeAttribute('data-sticky-drag-bound');
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.position = 'fixed';
        clone.style.left = '-10000px';
        clone.style.top = '-10000px';
        clone.style.margin = '0';
        clone.style.pointerEvents = 'none';
        const sourceTextarea = note.querySelector('textarea');
        const previewTextarea = clone.querySelector('textarea');
        if (sourceTextarea && previewTextarea) previewTextarea.value = sourceTextarea.value;
        document.body.append(clone);
        dragPreview = clone;
        if (event.dataTransfer) {
          const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
          const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
          event.dataTransfer.setDragImage(clone, offsetX, offsetY);
        }
      };

      const setLayoutFromGesture = (event) => {
        if (!dragged || window.innerWidth <= 980) return;
        const dx = event.clientX - dragAnchorX;
        if (stickyLayout === 'one' && dx >= 42) {
          persistStickyLayout('two');
          controller.syncStickyLayout();
          dragAnchorX = event.clientX;
          return;
        }
        if (stickyLayout === 'two' && dx <= -42) {
          persistStickyLayout('one');
          controller.syncStickyLayout();
          dragAnchorX = event.clientX;
        }
      };

      const placeDragged = (event) => {
        if (!dragged) return;
        const candidates = [...list.querySelectorAll('.overview-sticky-note:not(.is-dragging)')];
        if (!candidates.length) { list.append(dragged); return; }
        let target = candidates.find((note) => {
          const r = note.getBoundingClientRect();
          return event.clientY >= r.top && event.clientY <= r.bottom && event.clientX >= r.left && event.clientX <= r.right;
        });
        if (!target) {
          target = candidates.reduce((best, note) => {
            const r = note.getBoundingClientRect();
            const dx = event.clientX - (r.left + r.width / 2);
            const dy = event.clientY - (r.top + r.height / 2);
            const d = dx * dx + dy * dy;
            return !best || d < best.d ? { note, d } : best;
          }, null)?.note;
        }
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (stickyLayout === 'two') {
          const verticalBand = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * .28;
          const before = verticalBand
            ? event.clientX < rect.left + rect.width / 2
            : event.clientY < rect.top + rect.height / 2;
          if (before) target.before(dragged); else target.after(dragged);
        } else if (event.clientY < rect.top + rect.height / 2) {
          target.before(dragged);
        } else {
          target.after(dragged);
        }
      };

      list.ondragover = (event) => {
        if (!dragged) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        setLayoutFromGesture(event);
        placeDragged(event);
      };
      list.ondrop = (event) => {
        if (!dragged) return;
        event.preventDefault();
        didDrop = true;
        setLayoutFromGesture(event);
        placeDragged(event);
      };

      list.querySelectorAll('.overview-sticky-note').forEach((note) => {
        if (note.dataset.stickyDragBound === '1') return;
        note.dataset.stickyDragBound = '1';
        const head = note.querySelector('.overview-sticky-head');
        if (!head || note.classList.contains('is-draft')) return;
        head.draggable = true;
        head.addEventListener('dragstart', (event) => {
          if (event.target.closest('button,a,input,textarea')) { event.preventDefault(); return; }
          dragged = note;
          didDrop = false;
          layoutBeforeDrag = stickyLayout;
          dragAnchorX = event.clientX;
          note.classList.add('is-dragging');
          event.dataTransfer?.setData('text/plain', note.dataset.entityCommentId || 'sticky');
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          makeDragPreview(note, event);
        });
        head.addEventListener('dragend', async () => {
          note.classList.remove('is-dragging');
          removeDragPreview();
          if (!dragged) return;
          if (!didDrop && stickyLayout !== layoutBeforeDrag) {
            persistStickyLayout(layoutBeforeDrag);
            controller.syncStickyLayout();
          }
          dragged = null;
          const order = [...list.querySelectorAll('.overview-sticky-note:not(.is-draft)')].map((x) => x.dataset.entityCommentId).filter(Boolean);
          persistStickyOrder(order);
          const byId = new Map(state.comments.map((item) => [String(item.id), item]));
          const ordered = order.map((id) => byId.get(String(id))).filter(Boolean);
          const leftovers = state.comments.filter((item) => item._draft || !order.includes(String(item.id)));
          state.comments = [...leftovers.filter((item) => item._draft), ...ordered, ...leftovers.filter((item) => !item._draft)];
          try { await state.onReorder?.(order); } catch (_) {}
        });
      });
    },
    bindNoteEditors() {
      const list = document.getElementById(state.listId);
      if (!list) return;
      list.querySelectorAll('.overview-sticky-note').forEach((row) => {
        const textarea = row.querySelector('.overview-note-autosave');
        if (!textarea) return;
        const stateEl = row.querySelector('.overview-note-save-state');
        let timer = null;
        const save = async () => {
          const id = row.dataset.entityCommentId;
          const item = state.comments.find((x) => x.id === id);
          if (!item) return;
          const text = textarea.value;
          item.text = text;
          // An empty draft is only a local starter card and should not be created on the server.
          // An existing note, however, must be allowed to save an empty string so clearing the
          // textarea does not resurrect the previous text on the next open.
          if (item._draft && !text.trim()) { if (stateEl) stateEl.textContent = ''; return; }
          if (stateEl) stateEl.textContent = 'Сохраняю…';
          try {
            if (item._draft) {
              const created = await api.post(baseUrl, { text: text.trim(), color: item.color || 'yellow' });
              Object.assign(item, created, { _draft: false });
              row.dataset.entityCommentId = created.id;
              state.onChange?.({ type: 'create', savedCount: controller.savedCount(), item });
            } else {
              const updated = await api.put(`/api/comments/${encodeURIComponent(item.id)}`, { text, color: item.color || 'yellow' });
              Object.assign(item, updated);
              state.onChange?.({ type: 'update', savedCount: controller.savedCount(), item });
            }
            if (stateEl) stateEl.textContent = 'Сохранено';
            setTimeout(() => { if (stateEl?.isConnected && stateEl.textContent === 'Сохранено') stateEl.textContent = ''; }, 900);
          } catch (_) { if (stateEl) stateEl.textContent = 'Не сохранено'; }
        };
        textarea.oninput = () => {
          const id = row.dataset.entityCommentId;
          const item = state.comments.find((x) => x.id === id);
          if (item) {
            item.text = textarea.value;
          }
          clearTimeout(timer); timer = setTimeout(save, 550);
        };
        textarea.onblur = () => {
          clearTimeout(timer);
          const id = row.dataset.entityCommentId;
          const item = state.comments.find((x) => x.id === id);
          if (item && (!item._draft || textarea.value.trim())) save();
        };
        row.querySelectorAll('[data-note-format]').forEach((button) => button.onclick = () => {
          const f = button.dataset.noteFormat;
          if (f === 'bold') surroundSelection(textarea, '**');
          if (f === 'italic') surroundSelection(textarea, '*');
        });
      });
    },
    async moveToJournal(commentId, row = null) {
      const item = state.comments.find((x) => x.id === commentId);
      if (!item) return;
      const liveText = row?.querySelector('.overview-note-autosave')?.value;
      const text = String(liveText != null ? liveText : item.text || '').trim();
      if (!text) { toast('Сначала добавьте текст заметки'); return; }
      const journalText = state.journalPrefix ? `${state.journalPrefix}: ${text}` : text;
      if (!confirm('Перенести стикер в журнал? После переноса стикер будет удалён.')) return;
      const journalButton = row?.querySelector('[data-comment-action="journal"]');
      if (journalButton) journalButton.disabled = true;
      let createdJournal = null;
      try {
        createdJournal = await Resources.journal.create({ text: journalText, kind: 'note', createdAt: new Date().toISOString() });
        if (!item._draft) await api.del(`/api/comments/${encodeURIComponent(commentId)}`);
        state.comments = state.comments.filter((x) => x.id !== commentId);
        controller.render();
        state.onChange?.({ type: 'delete', savedCount: controller.savedCount(), item });
        toast('Заметка перенесена в журнал');
      } catch (_) {
        if (createdJournal?.id) {
          try { await Resources.journal.remove(createdJournal.id); } catch (_) {}
        }
        if (journalButton?.isConnected) journalButton.disabled = false;
        toast('Не удалось перенести заметку в журнал');
      }
    },
    async cycleColor(commentId) {
      const item = state.comments.find((x) => x.id === commentId);
      if (!item || item.canEdit === false) return;
      const current = stickyColors.includes(item.color) ? item.color : 'yellow';
      item.color = stickyColors[(stickyColors.indexOf(current) + 1) % stickyColors.length];
      if (!item._draft) Object.assign(item, await api.put(`/api/comments/${encodeURIComponent(item.id)}`, { text: item.text || '', color: item.color }));
      controller.render();
    },
    async remove(commentId) {
      const item = state.comments.find((x) => x.id === commentId);
      if (item && !item._draft) await api.del(`/api/comments/${encodeURIComponent(commentId)}`);
      state.comments = state.comments.filter((x) => x.id !== commentId);
      controller.render();
      state.onChange?.({ type: 'delete', savedCount: controller.savedCount(), item });
      toast(state.variant === 'notes' ? 'Заметка удалена' : 'Комментарий удалён');
    },
    async edit(commentId) {
      const item = state.comments.find((x) => x.id === commentId); if (!item) return;
      const text = prompt('Редактировать комментарий', item.text || ''); if (text == null || !text.trim()) return;
      Object.assign(item, await api.put(`/api/comments/${encodeURIComponent(commentId)}`, { text: text.trim() })); controller.render();
    },
    bind() {
      controller.render();
      if (state.variant === 'notes') window.addEventListener('resize', controller.syncStickyLayout, { passive: true });
      const list = document.getElementById(state.listId);
      if (list) list.onclick = (event) => {
        const action = event.target.closest('[data-comment-action]'); if (!action) return;
        const row = action.closest('[data-entity-comment-id]'); if (!row) return;
        const id = row.dataset.entityCommentId;
        if (action.dataset.commentAction === 'edit') controller.edit(id);
        if (action.dataset.commentAction === 'delete') controller.remove(id);
        if (action.dataset.commentAction === 'color') controller.cycleColor(id);
        if (action.dataset.commentAction === 'journal') controller.moveToJournal(id, row);
      };
      document.getElementById(state.addId)?.addEventListener('click', () => controller.addDraft());
      if (state.variant === 'notes') return controller;
      const input = document.getElementById(state.inputId), send = document.getElementById(state.sendId);
      if (!input || !send) return controller;
      const sync = () => { send.hidden = !input.value.trim(); };
      input.oninput = sync;
      send.onclick = async () => { const text = input.value.trim(); if (!text) return; const created = await api.post(baseUrl, { text, color: state.color }); state.comments.push(created); input.value=''; sync(); controller.render(); };
      sync(); return controller;
    },
  };
  return controller;
}
