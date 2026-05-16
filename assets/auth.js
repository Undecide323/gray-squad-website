// assets/auth.js
const GS_AUTH = (() => {
  const USER_KEY = 'gs_user';

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
      state,
    });
    const authUrl = `https://discord.com/oauth2/authorize?${params}`;
    const width = 500, height = 700;
    const left = (screen.width - width) / 2;
    const top  = (screen.height - height) / 2;
    window.open(authUrl, 'discordAuth',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  }

  // ─── ОБРАБОТКА КОДА ОТ CALLBACK ───
  async function handleAuthCode(code, state) {
    const savedState = sessionStorage.getItem('gs_state');
    sessionStorage.removeItem('gs_state');

    if (!code)               return { ok: false, error: 'Нет кода авторизации' };
    if (state !== savedState) return { ok: false, error: 'Ошибка безопасности' };

    try {
      const response = await fetch(GS.authFunctionUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // FIX: используем camelCase чтобы совпадало с Cloud Function
        body: JSON.stringify({ code, redirectUri: GS.discord.redirectUri }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const user = data.user || data.gsUser;
      if (!user) throw new Error('Данные пользователя не получены');

      // FIX: входим в Firebase Auth с custom token
      // Это позволяет Firestore rules проверять request.auth.uid
      if (data.firebaseToken && typeof firebase !== 'undefined') {
        try {
          await firebase.auth().signInWithCustomToken(data.firebaseToken);
          console.log('[Auth] Firebase sign-in OK, uid:', user.discordId || user.id);
        } catch (fbErr) {
          console.warn('[Auth] Firebase sign-in failed:', fbErr.message);
          // Не критично — продолжаем, но Firestore rules могут блокировать
        }
      }

      setUser(user);
      return { ok: true, user };
    } catch (err) {
      console.error('Token exchange error:', err);
      return { ok: false, error: err.message };
    }
  }

  // ─── Восстановить сессию Firebase при перезагрузке страницы ───
  async function restoreFirebaseSession() {
    const user = getUser();
    if (!user) return;

    // Если Firebase Auth уже авторизован — ничего не делаем
    if (typeof firebase !== 'undefined') {
      await new Promise(resolve => {
        const unsub = firebase.auth().onAuthStateChanged(fbUser => {
          unsub();
          resolve(fbUser);
        });
      }).then(async fbUser => {
        if (!fbUser) {
          // Нет Firebase сессии — запрашиваем новый токен тихо
          // (пользователь уже авторизован через Discord, просто Firebase сессия истекла)
          console.log('[Auth] Firebase session expired, will re-auth on next login');
        }
      });
    }
  }

  // ─── СЛУШАЕМ postMessage от callback.html ───
  window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;
    if (msg && msg.type === 'discord_auth' && msg.code) {
      const result = await handleAuthCode(msg.code, msg.state);
      if (result.ok) {
        if (typeof GS_NAV !== 'undefined' && GS_NAV.inject) GS_NAV.inject();
        else if (typeof updateUIAfterLogin === 'function') updateUIAfterLogin(result.user);
        console.log('Login success, role:', result.user?.role);
      } else {
        alert('Ошибка авторизации: ' + result.error);
      }
    }
  });

  // ─── ВЫХОД ───
  async function logout() {
    if (typeof firebase !== 'undefined') {
      try { await firebase.auth().signOut(); } catch(e) {}
    }
    clearUser();
    window.location.reload();
  }

  // ─── ИНИЦИАЛИЗАЦИЯ ───
  async function init() {
    if (window.location.pathname.includes('callback.html')) return null;
    await restoreFirebaseSession();
    return getUser();
  }

  // ─── ПРОВЕРКА РОЛИ ───
  function hasRole(role) {
    const user = getUser();
    if (!user) return false;
    if (role === 'admin') return user.role === 'admin' || user.role === 'creator';
    return user.role === role;
  }

  function avatarEl(user, size = 28) {
    if (!user) return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#333"></div>`;
    if (user.avatarUrl) return `<img src="${user.avatarUrl}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`;
    const letter = (user.displayName || user.username || '?')[0].toUpperCase();
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--red);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white">${letter}</div>`;
  }

  return { getUser, setUser, clearUser, isLoggedIn, login, logout, init, avatarEl, hasRole };
})();

if (!window.location.pathname.includes('callback.html')) {
  document.addEventListener('DOMContentLoaded', () => GS_AUTH.init());
}