// Schema-driven формы сущностей. Один renderer обслуживает create/edit режимы.
const EntityForm = {
  _instances: new Map(),

  fieldHtml(def, value, mode, context) {
    if (def.when && !def.when({ mode, value: context })) return '';
    const id = `ef-${def.key}`;
    const disabled = def.disabled?.({ mode, value: context }) ? 'disabled' : '';
    const label = escapeHtml(def.label || def.key);
    const raw = value ?? def.default ?? '';
    let control = '';

    if (def.render) {
      control = def.render({ id, value: raw, mode, context, disabled });
    } else if (def.type === 'textarea') {
      control = `<textarea id="${id}" rows="${def.rows || 3}" placeholder="${escapeHtml(def.placeholder || '')}" ${disabled}>${escapeHtml(raw)}</textarea>`;
    } else if (def.type === 'select') {
      const options = typeof def.options === 'function' ? def.options(context) : (def.options || []);
      const optionsHtml = options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option;
        return `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(raw) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`;
      }).join('');
      const emptyOption = def.emptyLabel !== undefined ? `<option value="">${escapeHtml(def.emptyLabel)}</option>` : '';
      control = `<select id="${id}" ${disabled}>${emptyOption}${optionsHtml}</select>`;
    } else if (def.type === 'checkbox') {
      control = `<label class="check-row"><input id="${id}" type="checkbox" ${raw ? 'checked' : ''} ${disabled}/><span>${escapeHtml(def.checkboxLabel || def.label || '')}</span></label>`;
    } else if (def.type === 'people') {
      control = `<div id="${id}" class="entity-form-people">${peoplePickerHtml(def.emptyLabel || 'Не назначено')}</div>`;
    } else if (def.type === 'multicheck') {
      const items = typeof def.options === 'function' ? def.options(context) : (def.options || []);
      const selected = Array.isArray(raw) ? raw : [];
      const rowsHtml = items.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option;
        return `<label class="check-row"><input type="checkbox" value="${escapeHtml(item.value)}" ${selected.includes(item.value) ? 'checked' : ''} ${disabled}/><span>${escapeHtml(item.label)}</span></label>`;
      }).join('');
      control = `<div id="${id}" class="entity-form-multicheck">${rowsHtml}</div>`;
    } else {
      control = `<input id="${id}" type="${def.type || 'text'}" value="${escapeHtml(raw)}" placeholder="${escapeHtml(def.placeholder || '')}" ${disabled}/>`;
    }

    const hint = def.hint ? `<div class="ui-field-hint field-hint">${escapeHtml(def.hint)}</div>` : '';
    return `<div class="ui-field field entity-form-field entity-form-field-${escapeHtml(def.type || 'text')}"><label class="ui-field-label field-label" for="${id}">${label}</label>${control}${hint}</div>`;
  },

  read(schema, initial, mode, instance) {
    const output = {};
    for (const def of schema) {
      if (def.when && !def.when({ mode, value: initial })) continue;

      if (def.read) {
        output[def.key] = def.read({ mode, initial, instance });
        continue;
      }

      if (def.type === 'people') {
        const selected = instance?.controls?.get(def.key)?.getSelected?.() || [];
        let value = def.multi === false ? (selected[0] || null) : selected;
        if (def.parse) value = def.parse(value, { mode, initial });
        output[def.key] = value;
        continue;
      }

      if (def.type === 'multicheck') {
        const root = document.getElementById(`ef-${def.key}`);
        let value = Array.from(root?.querySelectorAll('input[type="checkbox"]:checked') || []).map((el) => el.value);
        if (def.parse) value = def.parse(value, { mode, initial });
        output[def.key] = value;
        continue;
      }

      const el = document.getElementById(`ef-${def.key}`);
      if (!el) continue;
      let value = def.type === 'checkbox' ? el.checked : el.value;
      if (def.trim && typeof value === 'string') value = value.trim();
      if (def.parse) value = def.parse(value, { mode, initial });
      output[def.key] = value;
    }
    return output;
  },

  open(options) {
    const mode = options.mode || (options.value?.id ? 'edit' : 'create');
    const value = { ...(options.value || {}) };
    const editable = options.editable !== false;
    const schema = (options.schema || []).filter((def) => {
      if (mode === 'create' && def.create === false) return false;
      if (mode === 'edit' && def.edit === false) return false;
      return true;
    });
    const rows = schema.map((def) => EntityForm.fieldHtml({ ...def, disabled: def.disabled || (() => !editable) }, value[def.key], mode, value));

    const deleteButton = mode === 'edit' && editable && options.onDelete
      ? `<button class="ui-button ui-button--danger btn btn-danger btn-push-left" id="entity-form-delete">${icon('trash', 14)} Удалить</button>`
      : '';
    const saveButton = editable
      ? `<button class="ui-button ui-button--primary btn btn-primary" id="entity-form-save">${escapeHtml(options.saveLabel || 'Сохранить')}</button>`
      : '';
    Modal.open(`<h2>${escapeHtml(options.title || '')}</h2>
      <div class="entity-form-fields">${rows.join('')}</div>
      <div class="ui-modal-actions modal-actions">
        ${deleteButton}
        <button class="ui-button btn" id="entity-form-cancel">${editable ? 'Отмена' : 'Закрыть'}</button>
        ${saveButton}
      </div>`);

    const instance = { controls: new Map(), value, mode, schema };
    EntityForm._instances.set(Modal.root, instance);
    for (const def of schema) {
      if (def.type === 'people') {
        const root = document.getElementById(`ef-${def.key}`);
        const people = typeof def.people === 'function' ? def.people(value) : (def.people || store.team());
        const selected = Array.isArray(value[def.key]) ? value[def.key] : (value[def.key] ? [value[def.key]] : []);
        instance.controls.set(def.key, initPeoplePicker(root, people, selected, {
          multi: def.multi !== false,
          placeholder: def.placeholder || 'Добавить человека…',
        }));
      }
      def.init?.({ root: document.getElementById(`ef-${def.key}`), mode, value, instance });
    }

    document.getElementById('entity-form-cancel').addEventListener('click', () => Modal.close());
    if (!editable) return instance;

    document.getElementById('entity-form-save').addEventListener('click', async () => {
      const payload = EntityForm.read(schema, value, mode, instance);
      const error = options.validate?.(payload, { mode, initial: value });
      if (error) {
        toast(error);
        return;
      }
      await options.onSave(payload, { mode, initial: value, instance });
    });
    if (mode === 'edit' && options.onDelete) {
      document.getElementById('entity-form-delete').addEventListener('click', () => options.onDelete(value));
    }
    options.onReady?.(instance);
    return instance;
  },
};
