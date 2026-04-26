// ── GRAY SQUAD — nav.js ──────────────────────────────────────
// Общая навигация: инжектируется на каждой странице

const GS_NAV = (() => {
  const PAGES = {
    'index.html':'home', '/':'home',
    'events.html':'events', 'forum.html':'forum',
    'leaderboard.html':'leaderboard', 'shop.html':'shop',
    'profile.html':'profile', 'admin.html':'admin',
  };
  
  function activePage() {
    const p = window.location.pathname.split('/').pop() || 'index.html';
    return PAGES[p] || 'home';
  }

  function roleBadgeHtml(role) {
    const map = {
      creator:{ label:'CREATOR', cls:'rb-creator' },
      admin:  { label:'ADMIN',   cls:'rb-admin'   },
      member: { label:'MEMBER',  cls:'rb-member'  },
      user:   { label:'USER',    cls:'rb-user'    },
    };
    const r = map[role] || map.user;
    return `<span class="role-badge ${r.cls}">${r.label}</span>`;
  }

  function buildNav(user, active) {
    const isAdmin = user && (user.role === 'admin' || user.role === 'creator');
    const name = user ? (user.displayName || user.username) : '';
    const authHtml = user
      ? `<div class="bell-wrap" id="gsBellWrap">
           <button class="bell-btn" id="gsBellBtn">🔔
             <span class="bell-badge hidden" id="gsBellCount">0</span>
           </button>
           <div class="notif-dropdown" id="gsNotifDD">
             <div class="notif-head">Уведомления
               <span class="notif-clear" id="gsMarkAll">Прочитать все</span>
             </div>
             <div id="gsNotifList"><div class="notif-empty">Загрузка...</div></div>
           </div>
         </div>
         <a href="profile.html" class="avatar-btn">
           ${GS_AUTH.avatarEl(user)}
           <span>${name}</span>
           ${roleBadgeHtml(user.role)}
         </a>`
      : `<a href="#" class="btn-login" id="gsLoginBtn">🎮 Войти через Discord</a>`;

    return `<nav>
      <a href="index.html" class="logo">
        <img src="assets/logo.svg" alt="gs" style="height: 34px;">Gray<em>Squad</em>
      </a>
      <ul class="nav-links">
        <li><a href="index.html"       ${active === 'home' ? 'class="active"' : ''}>Главная</a></li>
        <li><a href="events.html"      ${active === 'events' ? 'class="active"' : ''}>Ивенты</a></li>
        <li><a href="forum.html"       ${active === 'forum' ? 'class="active"' : ''}>Форум</a></li>
        <li><a href="leaderboard.html" ${active === 'leaderboard' ? 'class="active"' : ''}>Лидерборд</a></li>
        <li><a href="shop.html"        ${active === 'shop' ? 'class="active"' : ''}>Магазин</a></li>
        ${isAdmin ? `<li><a href="admin.html" ${active === 'admin' ? 'class="active"' : ''}>Админка</a></li>` : ''}
      </ul>
      <div class="nav-right">${authHtml}</div>
    </nav>`;
  }

  // ── Уведомления ─────────────────────────────────────────────
  let _unsubNotif = null;
  
  function startNotifListener(user) {
    if (_unsubNotif) _unsubNotif();
    _unsubNotif = DB.listenNotifications(user.discordId || user.id, notifs => {
      const unread = notifs.filter(n => !n.readAt);
      const badge = document.getElementById('gsBellCount');
      if (badge) {
        badge.textContent = unread.length;
        badge.classList.toggle('hidden', unread.length === 0);
      }
      const list = document.getElementById('gsNotifList');
      if (!list) return;
      if (!notifs.length) { 
        list.innerHTML = '<div class="notif-empty">Нет уведомлений</div>'; 
        return; 
      }
      list.innerHTML = notifs.slice(0, 15).map(n => `
        <div class="notif-item" data-id="${n.id}">
          <div class="n-dot${n.readAt ? ' read' : ''}"></div>
          <div class="n-body">
            <div class="n-title">${n.title || ''}</div>
            <div class="n-msg">${n.message || ''}</div>
            <div class="n-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('.notif-item').forEach(el => {
        el.addEventListener('click', () => {
          DB.markNotifRead(el.dataset.id);
          el.querySelector('.n-dot')?.classList.add('read');
        });
      });
    });
  }

  // ── Слушать обновления профиля в навбаре ─────────────────────
  let _unsubProfile = null;
  
  function startProfileListener(user) {
    if (_unsubProfile) _unsubProfile();
    _unsubProfile = DB.listenUser(user.discordId || user.id, fresh => {
      GS_AUTH.setUser({ ...GS_AUTH.getUser(), ...fresh });
      // Обновить имя в навбаре
      const el = document.querySelector('.avatar-btn span');
      if (el) el.textContent = fresh.displayName || fresh.username || '';
    });
  }

  function bindEvents(user) {
    // Обработчик кнопки входа через Discord
    const loginBtn = document.getElementById('gsLoginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        GS_AUTH.login();
      });
    }

    // Обработчик кнопки выхода
    const logoutBtn = document.querySelector('[data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        GS_AUTH.logout();
      });
    }

    // Обработчик колокольчика уведомлений
    const bell = document.getElementById('gsBellBtn');
    if (bell) {
      bell.addEventListener('click', () => {
        document.getElementById('gsNotifDD')?.classList.toggle('open');
      });
    }

    // Закрытие уведомлений при клике вне их области
    document.addEventListener('click', (e) => {
      const w = document.getElementById('gsBellWrap');
      if (w && !w.contains(e.target)) {
        document.getElementById('gsNotifDD')?.classList.remove('open');
      }
    });

    // Обработчик кнопки "Прочитать все"
    const markAllBtn = document.getElementById('gsMarkAll');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        if (user) DB.markAllNotifsRead(user.discordId || user.id);
      });
    }
  }

  function inject() {
    const user = GS_AUTH.getUser();
    const active = activePage();
    const navEl = document.getElementById('nav-root');
    const tabEl = document.getElementById('tabs-root');
    
    if (navEl) navEl.outerHTML = buildNav(user, active);
    bindEvents(user);
    
    if (user && window.DB) {
      startNotifListener(user);
      startProfileListener(user);
    }
    
    // Скрыть элементы только для авторизованных
    if (!user) {
      document.querySelectorAll('[data-auth]').forEach(el => el.style.display = 'none');
    }
    if (!GS_AUTH.hasRole('admin')) {
      document.querySelectorAll('[data-role="admin"]').forEach(el => el.style.display = 'none');
    }
    if (!GS_AUTH.hasRole('creator')) {
      document.querySelectorAll('[data-role="creator"]').forEach(el => el.style.display = 'none');
    }
  }

  return { inject, roleBadgeHtml, activePage };
})();

document.addEventListener('DOMContentLoaded', GS_NAV.inject);