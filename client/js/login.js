document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('authForm');
  const saveBtn = document.getElementById('saveBtn');
  const authStatus = document.getElementById('authStatus');
  const fullNameInput = document.getElementById('fullName');
  const loginInput = document.getElementById('loginField');
  const passwordInput = document.getElementById('passwordField');
  const codeInput = document.getElementById('codeField');
  const modeToggle = document.getElementById('modeToggle');
  const resetToggle = document.getElementById('resetToggle');
  const authIntro = document.getElementById('authIntro');
  const codeLabel = document.getElementById('codeLabel');
  let authMode = 'login';
  let registrationCodeSent = false;
  let resetCodeSent = false;

  const redirectIfSessionExists = () => {
    const token = localStorage.getItem('synapse_session_token');
    const expiresAt = Number(localStorage.getItem('synapse_session_expires') || 0);
    if (token && expiresAt > Date.now()) {
      window.location.replace('/index.html');
      return true;
    }
    if (token) {
      localStorage.removeItem('synapse_session_token');
      localStorage.removeItem('synapse_session_expires');
    }
    return false;
  };

  const setMode = (mode) => {
    const modeChanged = authMode !== mode;
    authMode = mode;
    if (modeChanged) {
      registrationCodeSent = false;
      resetCodeSent = false;
      if (codeInput) codeInput.value = '';
    }
    const isRegister = mode === 'register';
    const isReset = mode === 'reset';
    const showCode = isRegister || (isReset && resetCodeSent);
    const needsCode = (isRegister && registrationCodeSent) || (isReset && resetCodeSent);
    if (fullNameInput && fullNameInput.parentElement) fullNameInput.parentElement.style.display = isRegister ? 'block' : 'none';
    if (codeInput && codeInput.parentElement) codeInput.parentElement.style.display = showCode ? 'block' : 'none';
    if (fullNameInput) fullNameInput.required = isRegister;
    if (passwordInput) {
      passwordInput.required = !isReset || resetCodeSent;
      passwordInput.autocomplete = isRegister || isReset ? 'new-password' : 'current-password';
      passwordInput.placeholder = isReset ? 'Новый пароль, не менее 8 символов' : 'Не менее 8 символов';
    }
    if (saveBtn) {
      saveBtn.textContent = isRegister
        ? (registrationCodeSent ? 'Подтвердить email' : 'Отправить код')
        : isReset
          ? (resetCodeSent ? 'Сменить пароль' : 'Отправить код')
          : 'Войти';
    }
    if (modeToggle) {
      modeToggle.textContent = isRegister ? 'Уже есть аккаунт? Войти' : 'Создать аккаунт';
      modeToggle.style.display = isReset ? 'none' : 'inline-flex';
    }
    if (resetToggle) resetToggle.style.display = isReset ? 'inline-flex' : isRegister ? 'none' : 'inline-flex';
    if (codeInput) codeInput.required = needsCode;
    if (codeLabel) codeLabel.firstChild.textContent = isReset ? 'Код для сброса пароля' : 'Код из письма';
    if (authIntro) {
      authIntro.textContent = isRegister
        ? 'Создайте аккаунт: укажите имя, email и пароль. Мы отправим код на вашу почту.'
        : isReset
          ? 'Укажите email, получите код из письма и задайте новый пароль.'
          : 'Введите email и пароль, чтобы открыть свои чаты.';
    }
  };

  const showAuthStatus = (message, type = 'info') => {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.dataset.type = type;
    authStatus.style.display = message ? 'block' : 'none';
  };

  const rememberSession = ({ user, session }) => {
    try {
      localStorage.setItem('synapse_user_name', user.name || user.login || 'User');
      localStorage.setItem('synapse_user_id', user.id);
      localStorage.setItem('synapse_user_login', user.login || '');
      localStorage.setItem('synapse_session_token', session.token);
      localStorage.setItem('synapse_session_expires', String(session.expiresAt || Date.now() + 86400000));
    } catch (e) {}
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = fullNameInput?.value.trim() || '';
    const login = loginInput?.value.trim() || '';
    const password = passwordInput?.value.trim() || '';
    const code = codeInput?.value.trim() || '';

    saveBtn.disabled = true;
    showAuthStatus('', 'info');
    try {
      if (authMode === 'register') {
        if (!registrationCodeSent) {
          const request = await fetch('/auth/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, purpose: 'register', name, password })
          });
          const requestData = await request.json();
          if (!request.ok) {
            throw new Error(requestData.error || 'Не удалось отправить код');
          }
          registrationCodeSent = true;
          setMode('register');
          showAuthStatus(`Код отправлен на ${requestData.sentTo || login}. Проверьте входящие и папку «Спам». Код действует 5 минут.`, 'code');
          codeInput?.focus();
          return;
        }

        const result = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, login, password, code })
        });
        const resultData = await result.json();
        if (!result.ok) {
          throw new Error(resultData.error || 'Регистрация не удалась');
        }
        registrationCodeSent = false;
        if (codeInput) codeInput.value = '';
        showAuthStatus('Регистрация успешно завершена.', 'success');
        rememberSession(resultData);
        window.location.href = '/index.html';
        return;
      }

      if (authMode === 'reset') {
        if (!resetCodeSent) {
          const request = await fetch('/auth/request-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, purpose: 'reset' })
          });
          const requestData = await request.json();
          if (!request.ok) {
            throw new Error(requestData.error || 'Не удалось отправить код');
          }
          resetCodeSent = true;
          setMode('reset');
          showAuthStatus(`Код отправлен на ${requestData.sentTo || login}. Проверьте входящие и папку «Спам». Код действует 5 минут.`, 'code');
          codeInput?.focus();
          return;
        }
        const result = await fetch('/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, code, newPassword: password })
        });
        const resultData = await result.json();
        if (!result.ok) {
          throw new Error(resultData.error || 'Сброс пароля не удался');
        }
        showAuthStatus('Пароль изменён. Теперь войдите с новым паролем.', 'success');
        setMode('login');
        if (codeInput) codeInput.value = '';
        return;
      }

      const result = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      });
      const resultData = await result.json();
      if (!result.ok) {
        throw new Error(resultData.error || 'Не удалось войти');
      }
      rememberSession(resultData);
      window.location.href = '/index.html';
    } catch (error) {
      showAuthStatus(error.message || 'Не удалось выполнить вход. Проверьте данные и повторите попытку.', 'error');
    } finally {
      saveBtn.disabled = false;
      setMode(authMode);
    }
  };

  if (redirectIfSessionExists()) {
    // Session redirect happens inside the helper; no top-level return is allowed in browser scripts.
  } else {
    modeToggle?.addEventListener('click', () => {
      setMode(authMode === 'register' ? 'login' : 'register');
      showAuthStatus('', 'info');
    });
    resetToggle?.addEventListener('click', () => {
      if (authMode === 'reset') {
        setMode('login');
        showAuthStatus('', 'info');
        return;
      }
      setMode('reset');
      showAuthStatus('', 'info');
    });

    setMode('login');
    authForm?.addEventListener('submit', handleSubmit);

    const savedName = localStorage.getItem('synapse_user_name');
    if (savedName && fullNameInput) {
      fullNameInput.value = savedName;
    }
  }
});