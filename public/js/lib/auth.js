// Authentication feature.
// ---------------- Авторизация ----------------

const Auth = {
  user: null,
  _starting: false,
  _started: false,

  roles() { return Array.isArray(Auth.user?.roles) && Auth.user.roles.length ? Auth.user.roles : [Auth.user?.role || 'member']; },
  hasRole(role) { return Auth.roles().includes(role); },
  can(permission) { return Auth.isAdmin() || Boolean(Auth.user?.permissions?.[permission]); },
  accessLevel(section) { return Auth.isAdmin() ? 'all_manage' : (Auth.user?.access?.[section] || 'none'); },
  accessCapabilities(section) {
    return ({
      none:{ view:0, manage:0 }, own_read:{ view:1, manage:0 }, own_manage:{ view:1, manage:1 },
      all_read:{ view:2, manage:0 }, all_own_manage:{ view:2, manage:1 }, all_manage:{ view:2, manage:2 },
      read:{ view:2, manage:0 }, own:{ view:2, manage:1 }, manage:{ view:2, manage:2 },
    })[Auth.accessLevel(section)] || { view:0, manage:0 };
  },
  canView(section) { return Auth.accessCapabilities(section).view > 0; },
  canViewAll(section) { return Auth.accessCapabilities(section).view >= 2; },
  canCreate(section) { return Auth.accessCapabilities(section).manage >= 1; },
  isManager() { return Auth.isAdmin() || Auth.can('workspace.manage'); },
  isTeamlead() { return Auth.hasRole('teamlead'); },
  isAdmin() { return Auth.hasRole('admin'); },
  isOwnPerson(personId) { return Boolean(Auth.user?.personId && Auth.user.personId === personId); },
  canManage(section) { return Auth.accessCapabilities(section).manage >= 2; },
  canManageOwn(section) { return Auth.accessCapabilities(section).manage >= 1; },
  canEditOwned(item, section = null) { return Boolean((section && Auth.canManage(section)) || (!section && Auth.isManager()) || ((section ? Auth.canManageOwn(section) : true) && item?.createdByUserId === Auth.user?.id)); },
  canEditTask(task) { const caps = Auth.accessCapabilities('tasks'); return Boolean(caps.manage >= 2 || (caps.manage >= 1 && (task?.createdByUserId === Auth.user?.id || (Auth.user?.personId && (task?.assigneeIds || []).includes(Auth.user.personId))))); },
  canDeleteTask(task) { return Auth.canEditTask(task); },
  canEditItem(section, item, relationFields = []) { const caps = Auth.accessCapabilities(section); if (caps.manage >= 2) return true; if (caps.manage < 1 || !item) return false; if (item.createdByUserId === Auth.user?.id) return true; return Boolean(Auth.user?.personId && relationFields.some((field) => Array.isArray(item?.[field]) && item[field].includes(Auth.user.personId))); },
  canDeleteItem(section, item, relationFields = []) { return Auth.canEditItem(section, item, relationFields); },
  roleLabel(role) { return ({ admin: 'Администратор', teamlead: 'Тимлид', member: 'Сотрудник' })[role] || 'Сотрудник'; },
  rolesLabel(user = Auth.user) { const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role || 'member']; return roles.map((r) => Auth.roleLabel(r)).join(' · '); },
  canManagePerson(person) { const caps = Auth.accessCapabilities('people'); return Boolean(caps.manage >= 2 || (caps.manage >= 1 && Auth.user?.personId && person?.type === 'team' && person.id === Auth.user.personId)); },

  async init() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('not_authenticated');
      const data = await res.json();
      Auth.user = data.user;
      if (Auth.user.mustChangePassword) {
        Auth.renderPasswordChange();
        return false;
      }
      Auth.showApp();
      return true;
    } catch (_) {
      Auth.user = null;
      Auth.renderLogin();
      return false;
    }
  },

  showApp() {
    document.getElementById('auth-root').innerHTML = '';
    document.body.classList.remove('auth-mode');
    document.getElementById('app').removeAttribute('aria-hidden');
  },

  showAuth() {
    document.body.classList.add('auth-mode');
    document.getElementById('app').setAttribute('aria-hidden', 'true');
    document.getElementById('modal-root').innerHTML = '';
  },

  renderLogin(message) {
    Auth.showAuth();
    const root = document.getElementById('auth-root');
    root.innerHTML = `<main class="auth-card">
      <div class="auth-brand"><span class="app-mark" aria-hidden="true"></span><span>Garden</span></div>
      <h1 class="auth-title">Вход</h1>
      <div class="auth-subtitle">Рабочее пространство команды</div>
      <form id="login-form" class="auth-form">
        <div class="ui-field field"><label class="ui-field-label field-label" for="login-username">Логин</label><input id="login-username" autocomplete="username" autofocus /></div>
        <div class="ui-field field"><label class="ui-field-label field-label" for="login-password">Пароль</label><div class="auth-password-wrap"><input id="login-password" type="password" autocomplete="current-password" /><button class="auth-password-toggle" type="button" id="login-password-toggle" aria-label="Показать пароль" title="Показать пароль"><svg class="auth-eye auth-eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg><svg class="auth-eye auth-eye-off" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7"/><path d="M6.2 6.3C3.8 8.1 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button></div></div>
        <div class="auth-error" id="login-error">${message ? escapeHtml(message) : ''}</div>
        <button class="ui-button ui-button--primary btn btn-primary auth-submit" type="submit">Войти</button>
        <div class="auth-divider"><span>или</span></div>
        <button class="ui-button btn auth-demo-submit" type="button" id="auth-demo">Запустить демо</button>
        <div class="auth-demo-note">Пример рабочего пространства на данных Dunder Mifflin · Scranton</div>
      </form>
    </main>`;
    const passwordInput = document.getElementById('login-password');
    const passwordToggle = document.getElementById('login-password-toggle');
    passwordToggle.onclick = () => {
      const willShow = passwordInput.type === 'password';
      passwordInput.type = willShow ? 'text' : 'password';
      passwordToggle.classList.toggle('is-visible', willShow);
      passwordToggle.setAttribute('aria-label', willShow ? 'Скрыть пароль' : 'Показать пароль');
      passwordToggle.setAttribute('title', willShow ? 'Скрыть пароль' : 'Показать пароль');
      passwordInput.focus({ preventScroll: true });
      const end = passwordInput.value.length;
      try { passwordInput.setSelectionRange(end, end); } catch (_) {}
    };

    document.getElementById('auth-demo').onclick = async () => {
      const button = document.getElementById('auth-demo');
      const error = document.getElementById('login-error');
      button.disabled = true; error.textContent = '';
      try {
        const data = await api.post('/api/auth/demo', {});
        Auth.user = data.user; Auth.showApp(); await startGardenApp();
      } catch (err) { error.textContent = 'Не удалось запустить демо.'; }
      finally { button.disabled = false; }
    };

    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('button');
      const error = document.getElementById('login-error');
      button.disabled = true;
      error.textContent = '';
      try {
        const data = await api.post('/api/auth/login', {
          username: document.getElementById('login-username').value.trim(),
          password: document.getElementById('login-password').value,
        });
        Auth.user = data.user;
        if (Auth.user.mustChangePassword) {
          Auth.renderPasswordChange();
          return;
        }
        Auth.showApp();
        await startGardenApp();
      } catch (err) {
        error.textContent = err.status === 429
          ? 'Слишком много попыток. Попробуйте позже.'
          : 'Неверный логин или пароль.';
      } finally {
        button.disabled = false;
      }
    };
  },

  renderPasswordChange() {
    Auth.showAuth();
    const root = document.getElementById('auth-root');
    root.innerHTML = `<main class="auth-card">
      <div class="auth-brand"><span class="app-mark" aria-hidden="true"></span><span>Garden</span></div>
      <h1 class="auth-title">Смените временный пароль</h1>
      <div class="auth-subtitle">Это нужно сделать только при первом входе или после сброса пароля администратором.</div>
      <form id="password-change-form" class="auth-form">
        <div class="ui-field field"><label class="ui-field-label field-label" for="auth-current-password">Текущий пароль</label><input id="auth-current-password" type="password" autocomplete="current-password" autofocus /></div>
        <div class="ui-field field"><label class="ui-field-label field-label" for="auth-new-password">Новый пароль</label><input id="auth-new-password" type="password" autocomplete="new-password" minlength="8" /></div>
        <div class="ui-field field"><label class="ui-field-label field-label" for="auth-new-password-2">Повторите новый пароль</label><input id="auth-new-password-2" type="password" autocomplete="new-password" minlength="8" /></div>
        <div class="auth-error" id="password-change-error"></div>
        <button class="ui-button ui-button--primary btn btn-primary auth-submit" type="submit">Сохранить пароль</button>
      </form>
    </main>`;
    document.getElementById('password-change-form').onsubmit = async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('auth-current-password').value;
      const newPassword = document.getElementById('auth-new-password').value;
      const confirmPassword = document.getElementById('auth-new-password-2').value;
      const error = document.getElementById('password-change-error');
      if (newPassword.length < 8) { error.textContent = 'Минимум 8 символов.'; return; }
      if (newPassword !== confirmPassword) { error.textContent = 'Новые пароли не совпадают.'; return; }
      try {
        const data = await api.post('/api/auth/password', { currentPassword, newPassword });
        Auth.user = data.user;
        Auth.showApp();
        await startGardenApp();
      } catch (err) {
        error.textContent = err.data?.error === 'wrong_current_password' ? 'Текущий пароль неверен.' : 'Не удалось сменить пароль.';
      }
    };
  },

  async logout() {
    try { await api.post('/api/auth/logout', {}); } catch (_) {}
    Auth.user = null;
    Auth.renderLogin();
  },

  onUnauthorized() {
    if (!Auth.user) return;
    Auth.user = null;
    Auth.renderLogin('Сессия завершена. Войдите снова.');
  },

  openAccount() {
    if (!Auth.user) return;
    Modal.open(`<h2>${escapeHtml(Auth.user.displayName)}</h2>
      <div class="account-meta">@${escapeHtml(Auth.user.username)} · ${Auth.rolesLabel(Auth.user)}</div>
      <div class="account-actions">
        <button class="ui-button btn" id="account-password">Сменить пароль</button>
        <button class="ui-button btn" id="account-logout">Выйти</button>
      </div>`);
    document.getElementById('account-password').onclick = () => Auth.openPasswordModal();
    document.getElementById('account-logout').onclick = async () => { Modal.close(); await Auth.logout(); };
  },

  openPasswordModal() {
    Modal.open(`<h2>Сменить пароль</h2>
      <div class="ui-field field"><label class="ui-field-label field-label" for="account-current">Текущий пароль</label><input id="account-current" type="password" autocomplete="current-password" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="account-new">Новый пароль</label><input id="account-new" type="password" autocomplete="new-password" minlength="8" /></div>
      <div class="ui-field field"><label class="ui-field-label field-label" for="account-new2">Повторите новый пароль</label><input id="account-new2" type="password" autocomplete="new-password" minlength="8" /></div>
      <div class="auth-error" id="account-password-error"></div>
      <div class="ui-modal-actions modal-actions"><button class="ui-button btn" data-modal-close>Отмена</button><button class="ui-button ui-button--primary btn btn-primary" id="account-password-save">Сохранить</button></div>`);
    document.getElementById('account-password-save').onclick = async () => {
      const currentPassword = document.getElementById('account-current').value;
      const newPassword = document.getElementById('account-new').value;
      const again = document.getElementById('account-new2').value;
      const error = document.getElementById('account-password-error');
      if (newPassword.length < 8) { error.textContent = 'Минимум 8 символов.'; return; }
      if (newPassword !== again) { error.textContent = 'Новые пароли не совпадают.'; return; }
      try {
        const data = await api.post('/api/auth/password', { currentPassword, newPassword });
        Auth.user = data.user;
        Modal.close();
        toast('Пароль изменён');
        renderSidebar(Router.current());
      } catch (err) {
        error.textContent = err.data?.error === 'wrong_current_password' ? 'Текущий пароль неверен.' : 'Не удалось сменить пароль.';
      }
    };
  },
};
window.Auth = Auth;

