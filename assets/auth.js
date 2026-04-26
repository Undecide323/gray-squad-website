// assets/auth.js
const GS_AUTH = (() => {
  const USER_KEY = 'gs_user';

  // ─── Хелперы ───
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }
  function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
  function clearUser() { localStorage.removeItem(USER_KEY); }
  function isLoggedIn() { return !!getUser(); }

  // ─── ВХОД (popup) ───
  function login() {
    const state = crypto.randomUUID();
    sessionStorage.setItem('gs_state', state);

    const params = new URLSearchParams({
      client_id:     GS.discord.clientId,
      redirect_uri:  GS.discord.redirectUri,
      response_type: 'code',
      scope:         GS.discord.scopes.join(' '),
      state:         state,
    });

    const authUrl = `https://discord.com/oauth2/authorize?${params}`;
    const width = 500, height = 700;
    const left = (screen.width - width) / 2;
    const top  = (screen.height - height) / 2;
    const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
    window.open(authUrl, 'discordAuth', features);
  }

  // ─── ОБРАБОТКА КОДА ОТ CALLBACK ───
  async function handleAuthCode(code, state) {
    const savedState = sessionStorage.getItem('gs_state');
    sessionStorage.removeItem('gs_state');

    if (!code)          return { ok: false, error: 'Нет кода авторизации' };
    if (state !== savedState) return { ok: false, error: 'Ошибка безопасности' };

    try {
      const response = await fetch(`${GS.botUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: GS.discord.redirectUri }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // ── FIX: бот может вернуть data.user ИЛИ data.gsUser ────
      const user = data.user || data.gsUser;
      if (!user) throw new Error('Данные пользователя не получены');

      setUser(user);
      return { ok: true, user };
    } catch (err) {
      console.error('Token exchange error:', err);
      return { ok: false, error: err.message };
    }
  }

  // ─── СЛУШАЕМ postMessage от callback.html ───
  window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;

    const msg = event.data;
    if (msg && msg.type === 'discord_auth' && msg.code) {
      const result = await handleAuthCode(msg.code, msg.state);

      if (result.ok) {
        if (typeof GS_NAV !== 'undefined' && GS_NAV.inject) {
          GS_NAV.inject();
        } else if (typeof updateUIAfterLogin === 'function') {
          updateUIAfterLogin(result.user);
        }
        console.log('Login success, role:', result.user?.role);
      } else {
        alert('Ошибка авторизации: ' + result.error);
      }
    }
  });

  // ─── ВЫХОД ───
  async function logout() {
    clearUser();
    window.location.reload();
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ───
  async function init() {
    if (window.location.pathname.includes('callback.html')) return null;
    return getUser();
  }

  // ─── ПРОВЕРКА РОЛИ ───
  function hasRole(role) {
    const user = getUser();
    if (!user) return false;
    if (role === 'admin') return user.role === 'admin' || user.role === 'creator';
    return user.role === role;
  }

  function avatarEl(user, size=28) {
    if (!user) return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#333;"></div>`;
    if (user.avatarUrl) return `<img src="${user.avatarUrl}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`;
    const letter = (user.displayName || user.username || '?')[0].toUpperCase();
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--red);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white">${letter}</div>`;
  }

  return { getUser, setUser, clearUser, isLoggedIn, login, logout, init, avatarEl, hasRole };
})();

if (!window.location.pathname.includes('callback.html')) {
  document.addEventListener('DOMContentLoaded', () => GS_AUTH.init());
}
