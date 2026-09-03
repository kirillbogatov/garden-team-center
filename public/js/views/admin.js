// Администрирование учётных записей, ролей и индивидуальных прав. Доступно только администраторам.

function adminDate(value) {
  if (!value) return 'Ещё не входил';
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch (_) { return value; }
}

function adminErrorText(err) {
  const code = err?.data?.error;
  return ({
    invalid_username: 'Логин: 3–40 символов, латиница, цифры, точка, дефис или подчёркивание.',
    username_exists: 'Такой логин уже используется.',
    display_name_required: 'Укажите имя пользователя.',
    last_admin: 'Нельзя отключить или снять роль администратора у последнего активного администратора.',
    cannot_delete_self: 'Нельзя удалить собственную учётную запись.',
    person_required: 'Для учётной записи без роли администратора нужно выбрать профиль сотрудника.',
    invalid_person: 'Выбранный профиль не найден.',
    person_already_linked: 'Этот профиль уже связан с другой активной учётной записью.',
  })[code] || 'Не удалось сохранить изменения.';
}

function adminRoles(user) {
  return Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role || 'member'];
}

Views.admin = async function () {
  if (!Auth.isAdmin()) return Router.go('/overview');
  setTopbar(`<h1>Учётные записи</h1><div class="actions"><button class="ui-button btn" data-route="/admin/roles">Права ролей</button><button class="ui-button ui-button--primary btn btn-primary" data-command="openAdminUserModal">+ Добавить пользователя</button></div>`);
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const [users, people] = await Promise.all([api.get('/api/admin/users'), Resources.people.list()]);
  const peopleById = Object.fromEntries(people.map((p) => [p.id, p]));
  view.innerHTML = `<div class="view-narrow admin-users-view">
    <div class="admin-intro">Роли задают отдельно область видимости и уровень управления для каждого раздела. По умолчанию тимлид видит и управляет всеми данными, а сотрудник видит свои и чужие записи, но управляет только своими. Индивидуальные права могут дополнительно расширить доступ конкретной учётной записи.</div>
    <div class="admin-users-list">
      ${users.map((u) => `<div class="admin-user-row ${u.active ? '' : 'is-disabled'}">
        <div class="admin-user-avatar">${escapeHtml((u.displayName || u.username).trim().charAt(0).toUpperCase())}</div>
        <div class="admin-user-main">
          <div class="admin-user-name">${escapeHtml(u.displayName)}</div>
          <div class="admin-user-meta">@${escapeHtml(u.username)} · ${escapeHtml(Auth.rolesLabel(u))}${u.personId && peopleById[u.personId] ? ' · ' + escapeHtml(peopleById[u.personId].name) : ''}${u.mustChangePassword ? ' · временный пароль' : ''}</div>
        </div>
        <div class="admin-user-last">${escapeHtml(adminDate(u.lastLoginAt))}</div>
        <div class="admin-user-state">${u.active ? 'Активен' : 'Отключён'}</div>
        <div class="flex gap-8">
          <button class="ui-button ui-button--sm btn btn-sm" data-command="openAdminPermissionsModal" data-command-arg="${u.id}">Права</button>
          <button class="ui-button ui-button--sm btn btn-sm" data-command="openAdminUserModal" data-command-arg="${u.id}">Изменить</button>
        </div>
      </div>`).join('') || emptyState('Нет учётных записей', '', 'team')}
    </div>
  </div>`;
};

async function openAdminUserModal(userId) {
  const [users, people] = await Promise.all([userId ? api.get('/api/admin/users') : Promise.resolve([]), Resources.people.list()]);
  const user = userId ? users.find((u) => u.id === userId) : null;
  const selectedRoles = new Set(adminRoles(user));
  const linkedActive = new Set(users.filter((u) => u.active && u.id !== userId && u.personId).map((u) => u.personId));
  Modal.open(`<h2>${user ? 'Учётная запись' : 'Новая учётная запись'}</h2>
    <div class="ui-field field"><label class="ui-field-label field-label" for="admin-user-name">Имя</label><input id="admin-user-name" value="${escapeHtml(user?.displayName || '')}" placeholder="Как показывать в Garden" /></div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="admin-user-login">Логин</label><input id="admin-user-login" value="${escapeHtml(user?.username || '')}" placeholder="например, kirill" autocomplete="off" /></div>
    <div class="ui-field field">
      <span class="ui-field-label field-label">Роли</span>
      <div class="admin-role-list">
        ${[['member','Сотрудник'],['teamlead','Тимлид'],['admin','Администратор']].map(([id,label]) => `<label class="admin-role-option"><input type="checkbox" data-admin-role="${id}" ${selectedRoles.has(id) || (!user && id === 'member') ? 'checked' : ''}><span>${label}</span></label>`).join('')}
      </div>
      <div class="ui-field-hint field-hint">Можно выбрать несколько ролей одновременно. Администратор всегда получает полный доступ.</div>
    </div>
    <div class="ui-field field"><label class="ui-field-label field-label" for="admin-user-person">Профиль сотрудника</label><select id="admin-user-person"><option value="">Без профиля</option>${people.filter((p) => p.type === 'team').map((p) => `<option value="${p.id}" ${user?.personId === p.id ? 'selected' : ''} ${linkedActive.has(p.id) ? 'disabled' : ''}>${escapeHtml(p.name)}${linkedActive.has(p.id) ? ' · уже связан' : ''}</option>`).join('')}</select><div class="ui-field-hint field-hint">Если нет роли администратора, профиль сотрудника обязателен.</div></div>
    ${user ? `<label class="admin-toggle"><input type="checkbox" id="admin-user-active" ${user.active ? 'checked' : ''} /><span>Доступ разрешён</span></label>` : ''}
    <div class="auth-error" id="admin-user-error"></div>
    <div class="ui-modal-actions modal-actions admin-modal-actions">
      ${user && user.id !== Auth.user.id ? `<button class="ui-button ui-button--ghost btn btn-ghost admin-delete-user" id="admin-user-delete">Удалить</button>` : '<span></span>'}
      <div class="flex gap-8">
        ${user ? `<button class="ui-button btn" id="admin-user-reset">Сбросить пароль</button>` : ''}
        <button class="ui-button btn" data-modal-close>Отмена</button>
        <button class="ui-button ui-button--primary btn btn-primary" id="admin-user-save">${user ? 'Сохранить' : 'Создать'}</button>
      </div>
    </div>`);

  const error = document.getElementById('admin-user-error');
  document.getElementById('admin-user-save').onclick = async () => {
    error.textContent = '';
    const roles = [...document.querySelectorAll('[data-admin-role]:checked')].map((el) => el.dataset.adminRole);
    if (!roles.length) { error.textContent = 'Выберите хотя бы одну роль.'; return; }
    const payload = {
      displayName: document.getElementById('admin-user-name').value.trim(),
      username: document.getElementById('admin-user-login').value.trim(),
      roles,
      personId: document.getElementById('admin-user-person').value || null,
    };
    if (user) payload.active = document.getElementById('admin-user-active').checked;
    try {
      if (user) {
        await api.put('/api/admin/users/' + user.id, payload);
        Modal.close();
        if (user.id === Auth.user.id) {
          const me = await api.get('/api/auth/me');
          Auth.user = me.user;
        }
        await Views.admin();
        renderSidebar(Router.current());
        toast('Учётная запись обновлена');
      } else {
        const result = await api.post('/api/admin/users', payload);
        showTemporaryPassword(result.user, result.temporaryPassword, 'Учётная запись создана');
      }
    } catch (err) { error.textContent = adminErrorText(err); }
  };

  if (user) {
    document.getElementById('admin-user-reset').onclick = async () => {
      try {
        const result = await api.post('/api/admin/users/' + user.id + '/reset-password', {});
        showTemporaryPassword(result.user, result.temporaryPassword, 'Пароль сброшен');
      } catch (err) { error.textContent = adminErrorText(err); }
    };
    const del = document.getElementById('admin-user-delete');
    if (del) del.onclick = async () => {
      const ok = await confirmAction(`Удалить учётную запись «${user.displayName}»? Рабочие данные Garden удалены не будут.`, 'Удалить');
      if (!ok) return;
      try {
        await api.del('/api/admin/users/' + user.id);
        Modal.close();
        await Views.admin();
        toast('Учётная запись удалена');
      } catch (err) { toast(adminErrorText(err)); }
    };
  }
}


function adminAccessControls(level) {
  const caps = {
    none: { available: false, own: 'read', foreign: 'none' },
    own_read: { available: true, own: 'read', foreign: 'none' },
    own_manage: { available: true, own: 'edit', foreign: 'none' },
    all_read: { available: true, own: 'read', foreign: 'read' },
    all_own_manage: { available: true, own: 'edit', foreign: 'read' },
    all_manage: { available: true, own: 'edit', foreign: 'edit' },
  };
  return caps[level] || caps.none;
}

function adminAccessLevelFromControls(available, own, foreign) {
  if (!available) return 'none';
  if (foreign === 'edit') return 'all_manage';
  if (foreign === 'read') return own === 'edit' ? 'all_own_manage' : 'all_read';
  return own === 'edit' ? 'own_manage' : 'own_read';
}

Views.adminRoleAccess = async function () {
  if (!Auth.isAdmin()) return Router.go('/overview');
  setTopbar(`<h1>Права ролей</h1><div class="actions"><button class="ui-button btn" data-route="/admin">Назад</button><button class="ui-button ui-button--primary btn btn-primary" id="admin-role-access-save">Сохранить</button></div>`, {
    crumbs: [{ label: 'Garden', path: '/overview' }, { label: 'Администрирование', path: '/admin' }, { label: 'Права ролей', path: '/admin/roles' }],
  });
  const view = document.getElementById('view');
  view.innerHTML = `<div class="tiny">Загрузка…</div>`;
  const schema = await api.get('/api/admin/access-schema');
  const rolePolicies = schema.rolePolicies || {};
  const roles = schema.roles || [];
  const selectedRole = Views._adminAccessRole && roles.some((role) => role.id === Views._adminAccessRole)
    ? Views._adminAccessRole
    : (roles.find((role) => role.id === 'member')?.id || roles[0]?.id);
  Views._adminAccessRole = selectedRole;
  Views._adminRoleDraft = Views._adminRoleDraft || JSON.parse(JSON.stringify(rolePolicies));
  // Refresh the draft from persisted values when opening the page from scratch.
  if (!Views._adminRoleDraftInitialized) {
    Views._adminRoleDraft = JSON.parse(JSON.stringify(rolePolicies));
    Views._adminRoleDraftInitialized = true;
  }
  const draft = Views._adminRoleDraft;
  const isAdminRole = selectedRole === 'admin';
  const policy = draft[selectedRole] || {};

  view.innerHTML = `<div class="admin-role-access-page">
    <div class="admin-role-access-toolbar">
      <div class="ui-field admin-role-access-role-field">
        <label class="ui-field-label field-label" for="admin-role-access-role">Роль</label>
        <select id="admin-role-access-role" data-role-access-role>
          ${roles.map((role) => `<option value="${escapeHtml(role.id)}" ${role.id === selectedRole ? 'selected' : ''}>${escapeHtml(role.label)}</option>`).join('')}
        </select>
      </div>
      <p class="admin-role-access-help">«Свои записи» определяются по авторству и связи с сотрудником: исполнитель задачи, участник встречи или проекта и т. п. Роль администратора всегда имеет полный доступ.</p>
    </div>
    <div class="admin-role-access-table-wrap">
      <table class="admin-role-access-table">
        <thead><tr><th>Раздел</th><th>Доступ к разделу</th><th>Свои записи</th><th>Чужие записи</th></tr></thead>
        <tbody>
          ${schema.areas.map((area) => {
            const controls = adminAccessControls(isAdminRole ? 'all_manage' : (policy[area.id] || 'none'));
            const disabled = isAdminRole ? 'disabled' : '';
            return `<tr data-admin-access-area="${escapeHtml(area.id)}">
              <td class="admin-role-access-area">${escapeHtml(area.label)}</td>
              <td><select data-admin-access-field="available" ${disabled}>
                <option value="1" ${controls.available ? 'selected' : ''}>Доступен</option>
                <option value="0" ${!controls.available ? 'selected' : ''}>Недоступен</option>
              </select></td>
              <td><select data-admin-access-field="own" ${disabled} ${controls.available ? '' : 'disabled'}>
                <option value="read" ${controls.own === 'read' ? 'selected' : ''}>Только просмотр</option>
                <option value="edit" ${controls.own === 'edit' ? 'selected' : ''}>Редактирование</option>
              </select></td>
              <td><select data-admin-access-field="foreign" ${disabled} ${controls.available ? '' : 'disabled'}>
                <option value="none" ${controls.foreign === 'none' ? 'selected' : ''}>Недоступно</option>
                <option value="read" ${controls.foreign === 'read' ? 'selected' : ''}>Только просмотр</option>
                <option value="edit" ${controls.foreign === 'edit' ? 'selected' : ''}>Редактирование</option>
              </select></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${isAdminRole ? `<div class="admin-permission-admin-note">Администратор всегда имеет полный доступ ко всем разделам. Эти настройки нельзя ограничить.</div>` : ''}
  </div>`;

  const syncRow = (row) => {
    if (!row || isAdminRole) return;
    const available = row.querySelector('[data-admin-access-field="available"]');
    const own = row.querySelector('[data-admin-access-field="own"]');
    const foreign = row.querySelector('[data-admin-access-field="foreign"]');
    const enabled = available.value === '1';
    own.disabled = !enabled;
    foreign.disabled = !enabled;
    if (enabled && foreign.value === 'edit' && own.value !== 'edit') own.value = 'edit';
    const area = row.dataset.adminAccessArea;
    draft[selectedRole] = draft[selectedRole] || {};
    draft[selectedRole][area] = adminAccessLevelFromControls(enabled, own.value, foreign.value);
  };

  document.getElementById('admin-role-access-role').onchange = (event) => {
    document.querySelectorAll('[data-admin-access-area]').forEach(syncRow);
    Views._adminAccessRole = event.target.value;
    Views.adminRoleAccess();
  };
  document.querySelectorAll('[data-admin-access-area] select').forEach((select) => {
    select.onchange = () => syncRow(select.closest('[data-admin-access-area]'));
  });
  document.getElementById('admin-role-access-save').onclick = async () => {
    document.querySelectorAll('[data-admin-access-area]').forEach(syncRow);
    try {
      await api.put('/api/admin/role-policies', { rolePolicies: draft });
      const me = await api.get('/api/auth/me');
      Auth.user = me.user;
      renderSidebar(Router.current());
      Views._adminRoleDraftInitialized = false;
      toast('Права ролей обновлены');
    } catch (_) { toast('Не удалось сохранить права ролей'); }
  };
};

async function openAdminRoleAccessModal() {
  return Router.go('/admin/roles');
}

async function openAdminPermissionsModal(userId) {
  if (!Auth.isAdmin()) return;
  const [users, schema] = await Promise.all([api.get('/api/admin/users'), api.get('/api/admin/access-schema')]);
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  const permissions = user.permissions || {};
  const admin = adminRoles(user).includes('admin');
  Modal.open(`<h2>Права · ${escapeHtml(user.displayName)}</h2>
    <p class="muted" style="margin-top:-4px">Роли задают базовый доступ. Здесь можно выдать дополнительные права конкретной учётной записи.</p>
    ${admin ? `<div class="admin-permission-admin-note">Роль «Администратор» уже даёт все права. Дополнительные настройки ниже будут сохранены, но не ограничивают администратора.</div>` : ''}
    <div class="admin-permissions-list">
      ${schema.permissions.map((perm) => `<label class="admin-permission-row"><input type="checkbox" data-admin-permission="${escapeHtml(perm.id)}" ${permissions[perm.id] ? 'checked' : ''}><span>${escapeHtml(perm.label)}</span></label>`).join('')}
    </div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="admin-permissions-save">Сохранить</button></div>`);
  document.getElementById('admin-permissions-save').onclick = async () => {
    const next = {};
    document.querySelectorAll('[data-admin-permission]').forEach((el) => { if (el.checked) next[el.dataset.adminPermission] = true; });
    try {
      await api.put('/api/admin/users/' + user.id, { permissions: next });
      Modal.close();
      if (user.id === Auth.user.id) {
        const me = await api.get('/api/auth/me');
        Auth.user = me.user;
        renderSidebar(Router.current());
      }
      await Views.admin();
      toast('Права обновлены');
    } catch (err) { toast(adminErrorText(err)); }
  };
}

function showTemporaryPassword(user, password, title) {
  Modal.open(`<h2>${escapeHtml(title)}</h2>
    <p class="muted admin-password-note">Передайте временный пароль пользователю. После первого входа Garden попросит его сменить.</p>
    <div class="admin-credential"><span>@${escapeHtml(user.username)}</span><strong id="temporary-password">${escapeHtml(password)}</strong></div>
    <div class="ui-modal-actions modal-actions"><button class="ui-button btn" id="copy-temporary-password">Копировать пароль</button><button class="ui-button ui-button--primary btn btn-primary" id="temporary-password-done">Готово</button></div>`);
  document.getElementById('copy-temporary-password').onclick = async () => {
    try { await navigator.clipboard.writeText(password); toast('Пароль скопирован'); }
    catch (_) { toast('Скопируйте пароль вручную'); }
  };
  document.getElementById('temporary-password-done').onclick = async () => {
    Modal.close();
    if (Router.current() === '/admin') await Views.admin();
  };
}

// Public feature commands used by the declarative command layer.
FeatureLoader.register({ openAdminUserModal, openAdminPermissionsModal, openAdminRoleAccessModal });
