// ── GRAY SQUAD — events.js ────────────────────────────────────
// Вся логика страницы ивентов. Подключается в events.html

const EV = (() => {

  let allEvents  = [];
  let myJoined   = new Set();
  let isCreator  = false;
  const user     = GS_AUTH.getUser();
  const isAdmin  = GS_AUTH.hasRole('admin');
  const canCreate = isAdmin || user?.canCreateEvents;

  // ── INIT ────────────────────────────────────────────────────
  function init() {
    if (canCreate) {
      document.getElementById('createBtn').style.display = 'inline-flex';
    }

    // Проверка на creator (роль создателя)
    if (user && user.role === 'creator') {
      isCreator = true;
      const panel = document.getElementById('gameFiltersPanel');
      if (panel) panel.style.display = '';
      loadGamesManage();
      document.getElementById('addGameBtn')?.addEventListener('click', () => addGame());
    }

    // Слушаем все ивенты в реальном времени
    DB.listenEvents(events => {
      allEvents = events;
      renderAll();
      updateSideStats();
      buildCalendar();
    });

    // Моя статистика (sidebar)
    if (user) {
      DB.listenUser(user.discordId || user.id, u => {
        renderMyEvents(u);
      });
    }

    // Загружаем динамические фильтры
    loadGameFilters();

    // Закрытие модалок
    document.getElementById('createModal')
      ?.addEventListener('click', e => { if (e.target.id === 'createModal') closeCreateModal(); });

    document.getElementById('finishModal')
      ?.addEventListener('click', e => { if (e.target.id === 'finishModal') closeFinishModal(); });
  }

  // ── ДИНАМИЧЕСКИЕ ФИЛЬТРЫ ────────────────────────────────────
  function loadGameFilters() {
    DB.listenGameFilters(games => {
      const container = document.getElementById('filterTabs');
      if (!container) return;

      let html = `<button class="ftab active" data-game="all">Все</button>`;
      games.forEach(game => {
        html += `<button class="ftab" data-game="${game.id}" data-icon="${game.icon || '🎮'}">${game.icon || '🎮'} ${game.name}</button>`;
      });
      container.innerHTML = html;

      // Перепривязываем события
      document.querySelectorAll('.ftab').forEach(btn =>
        btn.addEventListener('click', () => {
          document.querySelectorAll('.ftab').forEach(x => x.classList.remove('active'));
          btn.classList.add('active');
          renderAll();
        })
      );

      renderAll(); // перерисовка с учётом выбранного фильтра
    });
  }

  // ── УПРАВЛЕНИЕ ИГРАМИ (ТОЛЬКО CREATOR) ─────────────────────
  function loadGamesManage() {
    DB.listenGameFilters(games => {
      const container = document.getElementById('gamesManageList');
      if (!container) return;
      if (!games.length) {
        container.innerHTML = '<div style="color:var(--text-dim); font-size:.75rem">Нет игр. Добавьте первую.</div>';
        return;
      }
      container.innerHTML = games.map(g => `
        <div style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0; border-bottom:1px solid var(--border)">
          <span style="font-size:1rem">${g.icon || '🎮'}</span>
          <span style="flex:1"><b>${g.name}</b> <span style="font-size:.65rem; color:var(--text-dim)">(${g.id})</span></span>
          <button class="btn-ghost btn-sm" onclick="EV.removeGame('${g.id}')" style="padding:2px 8px">🗑️</button>
        </div>
      `).join('');
    });
  }

  async function addGame() {
    const name = document.getElementById('newGameName').value.trim();
    let id     = document.getElementById('newGameId').value.trim().toLowerCase();
    const icon = document.getElementById('newGameIcon').value.trim() || '🎮';
    if (!name || !id) { showToast('❌', 'Заполните название и id', '', true); return; }
    id = id.replace(/\s+/g, '_');
    await DB.addGameFilter({ id, name, icon, active: true });
    document.getElementById('newGameName').value = '';
    document.getElementById('newGameId').value = '';
    document.getElementById('newGameIcon').value = '';
    showToast('✅', `Игра "${name}" добавлена`, '');
  }

  async function removeGame(gameId) {
    if (confirm('Удалить игру из фильтров?')) {
      await DB.removeGameFilter(gameId);
      showToast('🗑️', 'Игра удалена', '');
    }
  }

  // ── RENDER ALL SECTIONS ─────────────────────────────────────
  function renderAll() {
    const now    = new Date();
    const filter = document.querySelector('.ftab.active')?.dataset.game || 'all';

    let events = allEvents;
    if (filter !== 'all') events = events.filter(e => (e.game || '').toLowerCase() === filter);

    const live     = events.filter(e => isLive(e, now));
    const upcoming = events.filter(e => !isLive(e, now) && e.status !== 'finished' && getStart(e) > now);
    const finished = events.filter(e => e.status === 'finished');

    renderLiveBanner(live[0] || null);
    renderList('upcomingList', upcoming, now, 'upcoming');
    renderList('finishedList', finished, now, 'finished');

    // Пересобрать joined set
    myJoined = new Set(
      allEvents
        .filter(e => (e.participants || []).includes(user?.discordId || user?.id))
        .map(e => e.id)
    );
  }

  // ── LIVE BANNER ─────────────────────────────────────────────
  function renderLiveBanner(ev) {
    const section = document.getElementById('liveSection');
    if (!ev) { section.style.display = 'none'; return; }
    section.style.display = '';

    const parts = (ev.participants || []).length;
    const joined = myJoined.has(ev.id);

    document.getElementById('liveBanner').innerHTML = `
      <div class="live-pill">LIVE</div>
      <div class="live-game-ico">${ev.gameIcon || '🎮'}</div>
      <div class="live-info">
        <div class="live-title">${ev.title}</div>
        <div class="live-meta">
          <span>👥 ${parts}/${ev.maxPlayers || '∞'} участников</span>
          <span>🎮 ${ev.game || ''}</span>
          <span>📅 ${formatDate(getStart(ev))}</span>
        </div>
        <div class="live-prizes" style="margin-top:.75rem">
          ${ev.prizes?.elo      ? `<div class="prize-chip pc-elo">🏆 +${ev.prizes.elo} ELO</div>` : ''}
          ${ev.prizes?.currency ? `<div class="prize-chip pc-coin">💰 ${fmtNum(ev.prizes.currency)} монет</div>` : ''}
          ${ev.prizes?.xp       ? `<div class="prize-chip pc-xp">⚡ +${ev.prizes.xp} XP</div>` : ''}
        </div>
        ${user ? `<button class="btn-join ${joined ? 'bj-done' : 'bj-red'}" style="margin-top:.85rem;width:100%" 
          onclick="EV.joinEvent('${ev.id}', this)">
          ${joined ? '✅ Вы участвуете' : '🎮 Записаться'}
        </button>` : ''}
        ${isAdmin ? `<button class="btn btn-ghost btn-sm" style="margin-top:.5rem;width:100%" 
          onclick="EV.openFinish('${ev.id}')">🏁 Завершить ивент</button>` : ''}
      </div>
      <div class="live-timer-col">
        <div class="timer-label">Осталось</div>
        <div class="timer-digits">
          <div class="timer-block"><span class="timer-num" id="lh">--</span><span class="timer-unit">ЧАС</span></div>
          <span class="timer-sep">:</span>
          <div class="timer-block"><span class="timer-num" id="lm">--</span><span class="timer-unit">МИН</span></div>
          <span class="timer-sep">:</span>
          <div class="timer-block"><span class="timer-num" id="ls">--</span><span class="timer-unit">СЕК</span></div>
        </div>
      </div>`;

    // Таймер обратного отсчёта
    const endTs = ev.endDate ? (ev.endDate.toDate?.() || new Date(ev.endDate)) : new Date(getStart(ev).getTime() + 4 * 3600000);
    startLiveTimer(endTs);
  }

  let liveTimerInterval = null;
  function startLiveTimer(endTs) {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    function tick() {
      const diff = endTs - Date.now();
      if (diff <= 0) { clearInterval(liveTimerInterval); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const nh = document.getElementById('lh');
      const nm = document.getElementById('lm');
      const ns = document.getElementById('ls');
      if (nh) nh.textContent = String(h).padStart(2, '0');
      if (nm) nm.textContent = String(m).padStart(2, '0');
      if (ns) ns.textContent = String(s).padStart(2, '0');
    }
    tick();
    liveTimerInterval = setInterval(tick, 1000);
  }

  // ── EVENT LIST ───────────────────────────────────────────────
  function renderList(containerId, events, now, type) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!events.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">${type === 'finished' ? '📁' : '📅'}</span>${type === 'finished' ? 'Нет завершённых ивентов' : 'Нет предстоящих ивентов'}</div>`;
      return;
    }

    el.innerHTML = events.map(ev => buildEventCard(ev, now, type)).join('');

    // Таймеры обратного отсчёта
    el.querySelectorAll('[data-countdown]').forEach(span => {
      const target = parseInt(span.dataset.countdown);
      const isEnd  = span.dataset.end === '1';
      const ticker = setInterval(() => {
        const diff = target - Date.now();
        if (diff <= 0) { span.textContent = isEnd ? 'Завершается' : 'СЕЙЧАС'; clearInterval(ticker); return; }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        span.textContent = h > 0
          ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }, 1000);
    });
  }

  function buildEventCard(ev, now, type) {
    const start   = getStart(ev);
    const end     = ev.endDate ? (ev.endDate.toDate?.() || new Date(ev.endDate)) : null;
    const parts   = ev.participants || [];
    const count   = parts.length;
    const max     = ev.maxPlayers || 0;
    const pct     = max ? Math.round(count / max * 100) : 0;
    const live    = isLive(ev, now);
    const soon    = !live && start > now;
    const done    = ev.status === 'finished';
    const joined  = myJoined.has(ev.id);
    const myId    = user?.discordId || user?.id;

    const accentCls = done ? 'acc-gray' : live ? 'acc-red' : soon ? 'acc-gold' : 'acc-green';
    const cardCls   = done ? 'c-gray'   : live ? ''        : soon ? 'c-gold'   : 'c-green';

    let badge = '';
    if (live) badge = '<span class="ev-badge eb-live">🔴 LIVE</span>';
    else if (done) badge = '<span class="ev-badge eb-done">✔ Завершён</span>';
    else if (soon && max && count >= max) badge = '<span class="ev-badge eb-closed">🔒 Мест нет</span>';
    else if (soon) badge = '<span class="ev-badge eb-soon">⏳ Скоро</span>';
    else badge = '<span class="ev-badge eb-open">✅ Открыт</span>';

    const countdownTs = live
      ? (end ? end.getTime() : start.getTime() + 4 * 3600000)
      : start.getTime();

    let btnHtml = '';
    if (user && !done) {
      if (joined) {
        btnHtml = `<button class="btn-join bj-done">✅ Записан</button>`;
      } else if (max && count >= max) {
        btnHtml = `<button class="btn-join bj-gray" disabled>Нет мест</button>`;
      } else {
        btnHtml = `<button class="btn-join bj-${live ? 'red' : 'gold'}" onclick="EV.joinEvent('${ev.id}',this)">Записаться</button>`;
      }
    }
    if (isAdmin && !done) {
      btnHtml += `<button class="btn btn-ghost btn-sm" onclick="EV.openFinish('${ev.id}')">🏁 Завершить</button>`;
    }

    // Аватарки участников
    const shownParts = parts.slice(0, 4);
    const partAvatars = shownParts.map(id => {
      return `<div class="part-av">${id.slice(0,1).toUpperCase()}</div>`;
    }).join('') + (parts.length > 4 ? `<div class="part-av">+${parts.length - 4}</div>` : '');

    return `
<div class="ev-card-full ${cardCls}">
  <div class="ev-accent ${accentCls}"></div>
  <div class="ev-inner">
    <div class="ev-game-ico">${ev.gameIcon || '🎮'}</div>
    <div class="ev-body">
      <div class="ev-title">${ev.title}</div>
      <div class="ev-badges">${badge}</div>
      <div class="ev-info-row">
        <span>👥 ${count}${max ? '/'+max : ''} мест</span>
        <span>📅 ${formatDate(start)}</span>
        ${ev.game ? `<span>🎮 ${ev.game}</span>` : ''}
        ${ev.description ? `<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev.description}</span>` : ''}
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">
        ${ev.prizes?.elo      ? `<div class="prize-chip pc-elo">🏆 +${ev.prizes.elo} ELO</div>` : ''}
        ${ev.prizes?.currency ? `<div class="prize-chip pc-coin">💰 ${fmtNum(ev.prizes.currency)} монет</div>` : ''}
        ${ev.prizes?.xp       ? `<div class="prize-chip pc-xp">⚡ +${ev.prizes.xp} XP</div>` : ''}
      </div>
    </div>
    <div class="ev-right-col">
      ${!done ? `
      <div class="ev-countdown">
        <div class="ev-tmr-lbl">${live ? 'Осталось' : 'Начало через'}</div>
        <span class="ev-tmr-val tv-${live?'red':soon?'gold':'green'}" data-countdown="${countdownTs}" ${live?'data-end="1"':''}>—</span>
      </div>` : `
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim)">Завершён<br>${formatDate(start)}</div>`}
      ${parts.length ? `<div class="part-avatars">${partAvatars}</div>` : ''}
      <div style="display:flex;gap:.4rem;flex-wrap:wrap">${btnHtml}</div>
    </div>
  </div>
  ${!done && max ? `
  <div class="part-bar-wrap">
    <div class="part-bar-header"><span>Заполнено мест</span><span>${count} / ${max}</span></div>
    <div class="part-bar-track"><div class="part-bar-fill pbf-${live?'red':soon?'gold':'green'}" style="width:${pct}%"></div></div>
  </div>` : ''}
</div>`;
  }

  // ── JOIN / LEAVE ─────────────────────────────────────────────
  async function joinEvent(eventId, btn) {
    if (!user) { GS_AUTH.login(); return; }
    try {
      btn.disabled = true;
      const result = await DB.toggleEventJoin(eventId, user.discordId || user.id);
      if (result === 'added') {
        btn.className = 'btn-join bj-done';
        btn.textContent = '✅ Записан';
        myJoined.add(eventId);
        showToast('✅', 'Записан на ивент!', '');
      } else {
        btn.className = 'btn-join bj-gold';
        btn.textContent = 'Записаться';
        myJoined.delete(eventId);
      }
    } catch (e) {
      showToast('❌', 'Ошибка', e.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  // ── FINISH EVENT ─────────────────────────────────────────────
  let finishingEventId = null;
  function openFinish(eventId) {
    const ev = allEvents.find(e => e.id === eventId);
    if (!ev) return;
    finishingEventId = eventId;
    document.getElementById('finishEventName').textContent = ev.title;

    const parts = ev.participants || [];
    document.getElementById('finishParticipants').innerHTML = parts.length
      ? parts.map(id => `
          <label style="display:flex;align-items:center;gap:.5rem;padding:.35rem 0;cursor:pointer;font-size:.88rem">
            <input type="checkbox" value="${id}" checked style="accent-color:var(--red)">
            <span>${id}</span>
          </label>`).join('')
      : '<div style="color:var(--text-dim);font-size:.85rem">Нет записавшихся</div>';

    document.getElementById('finishModal').classList.add('open');
  }

  async function confirmFinish() {
    const checked = [...document.querySelectorAll('#finishParticipants input:checked')].map(i => i.value);
    try {
      await DB.finishEvent(finishingEventId, checked);
      closeFinishModal();
      showToast('🏁', 'Ивент завершён!', `Призы выданы ${checked.length} участникам`);
    } catch (e) {
      showToast('❌', 'Ошибка', e.message, true);
    }
  }
  function closeFinishModal() { document.getElementById('finishModal').classList.remove('open'); }

  // ── CREATE EVENT ─────────────────────────────────────────────
  function openCreateModal() { document.getElementById('createModal').classList.add('open'); }
  function closeCreateModal() { document.getElementById('createModal').classList.remove('open'); }

  async function submitCreate() {
    if (!user) return;
    const title   = document.getElementById('evTitle').value.trim();
    const game    = document.getElementById('evGame').value.trim();
    const icon    = document.getElementById('evIcon').value.trim() || '🎮';
    const maxP    = parseInt(document.getElementById('evMax').value) || 0;
    const startDt = document.getElementById('evStart').value;
    const endDt   = document.getElementById('evEnd').value;
    const desc    = document.getElementById('evDesc').value.trim();
    const prElo   = parseInt(document.getElementById('prElo').value)  || 0;
    const prCoin  = parseInt(document.getElementById('prCoin').value) || 0;
    const prXp    = parseInt(document.getElementById('prXp').value)   || 0;

    if (!title)   { showToast('❌', 'Укажите название', '', true); return; }
    if (!startDt) { showToast('❌', 'Укажите дату начала', '', true); return; }

    try {
      await DB.createEvent({
        title, game, gameIcon: icon,
        maxPlayers:  maxP,
        startDate:   firebase.firestore.Timestamp.fromDate(new Date(startDt)),
        endDate:     endDt ? firebase.firestore.Timestamp.fromDate(new Date(endDt)) : null,
        description: desc,
        prizes:      { elo: prElo, currency: prCoin, xp: prXp },
        createdBy:   user.discordId || user.id,
        status:      'open',
      });
      closeCreateModal();
      clearCreateForm();
      showToast('📅', 'Ивент создан!', title);
    } catch (e) {
      showToast('❌', 'Ошибка создания', e.message, true);
    }
  }

  function clearCreateForm() {
    ['evTitle','evGame','evIcon','evMax','evStart','evEnd','evDesc','prElo','prCoin','prXp']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }

  // ── SIDEBAR ──────────────────────────────────────────────────
  function renderMyEvents(u) {
    const myId = u.discordId || u.id;
    const mine = allEvents.filter(e => (e.participants || []).includes(myId));
    const el   = document.getElementById('myEventsList');
    if (!el) return;

    if (!mine.length) {
      el.innerHTML = '<div style="padding:1rem;text-align:center;font-family:var(--font-mono);font-size:.72rem;color:var(--text-dim)">Вы не записаны</div>';
      return;
    }

    const now = new Date();
    el.innerHTML = mine.map(ev => {
      const start = getStart(ev);
      const live  = isLive(ev, now);
      const done  = ev.status === 'finished';
      return `<div class="my-ev-row">
        <div class="my-ev-ico">${ev.gameIcon || '🎮'}</div>
        <div class="my-ev-info">
          <div class="my-ev-name">${ev.title}</div>
          <div class="my-ev-sub">${formatDate(start)}</div>
        </div>
        <div class="my-ev-status" style="color:${done?'var(--text-dim)':live?'var(--red)':'var(--gold)'}">
          ${done ? '✔' : live ? 'LIVE' : '⏳'}
        </div>
      </div>`;
    }).join('');
  }

  function updateSideStats() {
    const now  = new Date();
    const live = allEvents.filter(e => isLive(e, now)).length;
    const up   = allEvents.filter(e => !isLive(e, now) && e.status !== 'finished').length;
    const done = allEvents.filter(e => e.status === 'finished').length;
    const myId = user?.discordId || user?.id;
    const myCount = myId ? allEvents.filter(e => (e.participants||[]).includes(myId)).length : 0;

    document.getElementById('statLive').textContent  = live;
    document.getElementById('statUp').textContent    = up;
    document.getElementById('statTotal').textContent = allEvents.length;
    document.getElementById('statMine').textContent  = myCount;
  }

  // ── CALENDAR ─────────────────────────────────────────────────
  let calDate = new Date();
  function buildCalendar() {
    const year  = calDate.getFullYear();
    const month = calDate.getMonth();
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

    document.getElementById('calMonth').textContent = `${monthNames[month]} ${year}`;

    const eventDays = new Set(
      allEvents.map(e => {
        const d = getStart(e);
        return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : null;
      }).filter(Boolean)
    );

    const firstDay = new Date(year, month, 1).getDay();
    const offset   = (firstDay === 0 ? 6 : firstDay - 1); // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today    = new Date();

    let html = '';
    for (let i = 0; i < offset; i++) {
      const d = new Date(year, month, -offset + i + 1).getDate();
      html += `<div class="cal-day other-month">${d}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===d;
      const hasEv   = eventDays.has(d);
      html += `<div class="cal-day${isToday?' today':''}${hasEv?' has-ev':''}">${d}</div>`;
    }
    document.getElementById('calGrid').innerHTML = html;
  }

  function calPrev() { calDate.setMonth(calDate.getMonth() - 1); buildCalendar(); }
  function calNext() { calDate.setMonth(calDate.getMonth() + 1); buildCalendar(); }

  // ── HELPERS ──────────────────────────────────────────────────
  function getStart(ev) { return ev.startDate?.toDate?.() || new Date(ev.startDate); }
  function isLive(ev, now) {
    if (ev.status === 'finished') return false;
    const s = getStart(ev);
    const e = ev.endDate ? (ev.endDate.toDate?.() || new Date(ev.endDate)) : new Date(s.getTime() + 4 * 3600000);
    return s <= now && now <= e;
  }
  function formatDate(d) {
    return d.toLocaleDateString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }

  // Toast
  let _tt;
  function showToast(icon, title, sub, err=false) {
    const t = document.getElementById('toast');
    t.className = 'toast' + (err ? ' err' : '');
    document.getElementById('toastIcon').textContent  = icon;
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastTitle').style.color = err ? 'var(--red)' : 'var(--green)';
    document.getElementById('toastSub').textContent   = sub;
    clearTimeout(_tt); _tt = setTimeout(() => t.classList.add('hidden'), 3200);
  }

  // Public API
  return {
    init,
    joinEvent,
    openFinish,
    confirmFinish,
    closeFinishModal,
    openCreateModal,
    closeCreateModal,
    submitCreate,
    calPrev,
    calNext,
    addGame,
    removeGame
  };
})();

document.addEventListener('DOMContentLoaded', EV.init);