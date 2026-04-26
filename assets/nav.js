// ── GRAY SQUAD — nav.js ──────────────────────────────────────
// Общая навигация: инжектируется на каждой странице

const GS_NAV = (() => {
  // ── Маппинг страниц (чистые URL + .html для Cloudflare) ─────
  const PAGES = {
    'index.html':'home', '/':'home', '':'home',
    'events.html':'events', 'events':'events',
    'forum.html':'forum',   'forum':'forum',
    'leaderboard.html':'leaderboard', 'leaderboard':'leaderboard',
    'shop.html':'shop',     'shop':'shop',
    'profile.html':'profile','profile':'profile',
    'admin.html':'admin',   'admin':'admin',
  };

  // ── FIX: Работает и с /events.html и с /events (Cloudflare) ──
  function activePage() {
    const pathname = window.location.pathname;
    const p = pathname.split('/').pop() || '';
    if (PAGES[p]) return PAGES[p];
    if (pathname === '/' || pathname === '') return 'home';
    const noExt = p.replace('.html', '');
    if (PAGES[noExt]) return PAGES[noExt];
    if (PAGES[noExt + '.html']) return PAGES[noExt + '.html'];
    for (const [key, val] of Object.entries(PAGES)) {
      const seg = key.replace('.html','');
      if (seg && seg !== '' && pathname.endsWith('/' + seg)) return val;
    }
    return 'home';
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

  // ── Иконки уведомлений по типу ───────────────────────────────
  function notifMeta(type) {
    const map = {
      announcement:    { icon:'📢', color:'var(--red)' },
      event:           { icon:'📅', color:'var(--gold)' },
      achievement:     { icon:'🏅', color:'var(--gold)' },
      level_up:        { icon:'🆙', color:'var(--green)' },
      purchase:        { icon:'🛒', color:'var(--green)' },
      purchase_failed: { icon:'❌', color:'var(--red)' },
      warn:            { icon:'⚠️', color:'var(--red)' },
      rank_up:         { icon:'🏆', color:'#B9F2FF' },
      daily_bonus:     { icon:'🎁', color:'var(--gold)' },
      report_closed:   { icon:'📋', color:'var(--text-dim)' },
    };
    return map[type] || { icon:'🔔', color:'var(--text-dim)' };
  }

  // ── Строим навигацию ─────────────────────────────────────────
  function buildNav(user, active) {
    const isAdmin = user && (user.role === 'admin' || user.role === 'creator');
    const name    = user ? (user.displayName || user.username) : '';

    function navLink(href, page, emoji, label) {
      const cls = active === page ? 'class="active"' : '';
      return `<li><a href="${href}" ${cls}>
        <span class="nav-emoji">${emoji}</span>
        <span class="nav-text">${label}</span>
      </a></li>`;
    }

    const authHtml = user
      ? `<div class="bell-wrap" id="gsBellWrap">
           <button class="bell-btn" id="gsBellBtn">🔔
             <span class="bell-badge hidden" id="gsBellCount">0</span>
           </button>
           <div class="notif-dropdown" id="gsNotifDD">
             <div class="notif-head">
               <span>Уведомления</span>
               <span class="notif-clear" id="gsMarkAll">Прочитать все</span>
             </div>
             <div id="gsNotifList"><div class="notif-empty">Загрузка...</div></div>
             <div class="notif-footer">
               <button class="notif-see-all" id="gsLoadMoreNotif">Загрузить ещё</button>
             </div>
           </div>
         </div>
         <a href="profile.html" class="avatar-btn">
           ${GS_AUTH.avatarEl(user)}
           <span class="nav-username">${name}</span>
           ${roleBadgeHtml(user.role)}
         </a>`
      : `<a href="#" class="btn-login" id="gsLoginBtn">🎮 Войти</a>`;

    return `<nav>
      <a href="index.html" class="logo">
        <img src="assets/logo.svg" alt="gs" style="height: 34px;">
        <span class="logo-text">Gray<em>Squad</em></span>
      </a>
      <ul class="nav-links">
        ${navLink('index.html',       'home',        '🏠', 'Главная')}
        ${navLink('events.html',      'events',      '🎉', 'Ивенты')}
        ${navLink('forum.html',       'forum',       '💬', 'Форум')}
        ${navLink('leaderboard.html', 'leaderboard', '🏆', 'Лидерборд')}
        ${navLink('shop.html',        'shop',        '🛒', 'Магазин')}
        ${isAdmin ? navLink('admin.html', 'admin', '⚙️', 'Админка') : ''}
      </ul>
      <div class="nav-right">${authHtml}</div>
    </nav>`;
  }

  // ── Уведомления с пагинацией ─────────────────────────────────
  let _unsubNotif  = null;
  let _notifOffset = 0;
  let _allNotifs   = [];
  const NOTIF_PAGE = 10;

  function renderNotifList() {
    const list = document.getElementById('gsNotifList');
    if (!list) return;

    if (!_allNotifs.length) {
      list.innerHTML = '<div class="notif-empty">Нет уведомлений</div>';
      const btn = document.getElementById('gsLoadMoreNotif');
      if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }
      return;
    }

    const visible = _allNotifs.slice(0, _notifOffset + NOTIF_PAGE);
    list.innerHTML = visible.map(n => {
      const meta = notifMeta(n.type);
      return `<div class="notif-item${n.readAt ? ' read-item' : ''}" data-id="${n.id}">
        <div class="n-type-icon" style="color:${meta.color}">${meta.icon}</div>
        <div class="n-body">
          <div class="n-title">${n.title || ''}</div>
          <div class="n-msg">${n.message || ''}</div>
          <div class="n-time">${timeAgo(n.createdAt)}</div>
        </div>
        <div class="n-dot${n.readAt ? ' read' : ''}"></div>
      </div>`;
    }).join('');

    const btn = document.getElementById('gsLoadMoreNotif');
    if (btn) {
      const hasMore = visible.length < _allNotifs.length;
      btn.textContent = hasMore
        ? `Загрузить ещё (${_allNotifs.length - visible.length})`
        : 'Всё загружено';
      btn.disabled    = !hasMore;
      btn.style.opacity = hasMore ? '1' : '.45';
    }

    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        DB.markNotifRead(el.dataset.id);
        el.querySelector('.n-dot')?.classList.add('read');
        el.classList.add('read-item');
      });
    });
  }

  function startNotifListener(user) {
    if (_unsubNotif) _unsubNotif();
    _notifOffset = 0;
    const uid = user.discordId || user.id;

    // Грузим до 50 чтобы пагинация работала на клиенте
    _unsubNotif = firebase.firestore()
      .collection('notifications')
      .where('userId','in',[uid, 'all'])
      .orderBy('createdAt','desc')
      .limit(50)
      .onSnapshot(snap => {
        _allNotifs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        const unread = _allNotifs.filter(n => !n.readAt).length;
        const badge  = document.getElementById('gsBellCount');
        if (badge) {
          badge.textContent = unread;
          badge.classList.toggle('hidden', unread === 0);
        }
        renderNotifList();
      });
  }

  // ── Слушать обновления профиля ────────────────────────────────
  let _unsubProfile = null;

  function startProfileListener(user) {
    if (_unsubProfile) _unsubProfile();
    _unsubProfile = DB.listenUser(user.discordId || user.id, fresh => {
      GS_AUTH.setUser({ ...GS_AUTH.getUser(), ...fresh });

      // Обновить имя
      const nameEl = document.querySelector('.avatar-btn .nav-username');
      if (nameEl) nameEl.textContent = fresh.displayName || fresh.username || '';

      // ── FIX: Обновить badge роли из Firestore ───────────────
      const badgeEl = document.querySelector('.avatar-btn .role-badge');
      if (badgeEl && fresh.role) {
        const map = {
          creator:{ label:'CREATOR', cls:'rb-creator' },
          admin:  { label:'ADMIN',   cls:'rb-admin'   },
          member: { label:'MEMBER',  cls:'rb-member'  },
          user:   { label:'USER',    cls:'rb-user'    },
        };
        const r = map[fresh.role] || map.user;
        badgeEl.textContent = r.label;
        badgeEl.className   = `role-badge ${r.cls}`;
      }

      // Показать Админку если роль стала admin/creator
      const isAdminNow = fresh.role === 'admin' || fresh.role === 'creator';
      const adminLink  = document.querySelector('.nav-links a[href="admin.html"]');
      if (!adminLink && isAdminNow) {
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
          const li = document.createElement('li');
          const ac = activePage() === 'admin' ? 'class="active"' : '';
          li.innerHTML = `<a href="admin.html" ${ac}>
            <span class="nav-emoji">⚙️</span>
            <span class="nav-text">Админка</span>
          </a>`;
          navLinks.appendChild(li);
        }
      }
    });
  }

  // ── Обработчики ──────────────────────────────────────────────
  function bindEvents(user) {
    const loginBtn = document.getElementById('gsLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', e => { e.preventDefault(); GS_AUTH.login(); });

    const logoutBtn = document.querySelector('[data-action="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); GS_AUTH.logout(); });

    const bell = document.getElementById('gsBellBtn');
    if (bell) {
      bell.addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('gsNotifDD')?.classList.toggle('open');
      });
    }

    document.addEventListener('click', e => {
      const w = document.getElementById('gsBellWrap');
      if (w && !w.contains(e.target)) document.getElementById('gsNotifDD')?.classList.remove('open');
    });

    const markAllBtn = document.getElementById('gsMarkAll');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        if (user) DB.markAllNotifsRead(user.discordId || user.id);
      });
    }

    const loadMoreBtn = document.getElementById('gsLoadMoreNotif');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        _notifOffset += NOTIF_PAGE;
        renderNotifList();
      });
    }
  }

  // ── Инжект ───────────────────────────────────────────────────
  function inject() {
    const user   = GS_AUTH.getUser();
    const active = activePage();
    const navEl  = document.getElementById('nav-root');

    if (navEl) navEl.outerHTML = buildNav(user, active);
    bindEvents(user);

    if (user && window.DB) {
      startNotifListener(user);
      startProfileListener(user);
    }

    if (!user) document.querySelectorAll('[data-auth]').forEach(el => el.style.display = 'none');
    if (!GS_AUTH.hasRole('admin'))   document.querySelectorAll('[data-role="admin"]').forEach(el => el.style.display = 'none');
    if (!GS_AUTH.hasRole('creator')) document.querySelectorAll('[data-role="creator"]').forEach(el => el.style.display = 'none');
  }

  return { inject, roleBadgeHtml, activePage };
})();

document.addEventListener('DOMContentLoaded', GS_NAV.inject);
