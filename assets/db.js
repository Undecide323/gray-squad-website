// ── GRAY SQUAD — db.js ───────────────────────────────────────
// Все операции с Firestore. Импортируется на каждой странице.

const DB = (() => {
  function fs() { return firebase.firestore(); }
  const FV = () => firebase.firestore.FieldValue;

  // ════════════════════════════════════════════
  //  USERS
  // ════════════════════════════════════════════

  /** Получить одного пользователя */
  async function getUser(discordId) {
    const snap = await fs().collection('users').doc(discordId).get();
    return snap.exists ? { id:snap.id, ...snap.data() } : null;
  }

  /** Слушать список пользователей (лидерборд) */
  function listenUsers(orderField='elo', limitN=50, cb) {
    return fs().collection('users')
      .orderBy(orderField, 'desc')
      .limit(limitN)
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  /** Обновить профиль */
  async function updateUser(discordId, fields) {
    await fs().collection('users').doc(discordId).update(fields);
  }

  /** Слушать конкретного пользователя */
  function listenUser(discordId, cb) {
    return fs().collection('users').doc(discordId)
      .onSnapshot(snap => { if(snap.exists) cb({ id:snap.id, ...snap.data() }); });
  }

  // ════════════════════════════════════════════
  //  VOICE PRESENCE
  // ════════════════════════════════════════════

  /** Слушать виджет голосовых (обновляется ботом каждые 30с) */
  function listenVoice(cb) {
    return fs().collection('voicePresence').doc('main')
      .onSnapshot(snap => {
        if (snap.exists) cb(snap.data().users || [], snap.data().updatedAt);
        else cb([], null);
      });
  }

  // ════════════════════════════════════════════
  //  EVENTS
  // ════════════════════════════════════════════

  /** Слушать все ивенты */
  function listenEvents(cb) {
    return fs().collection('events')
      .orderBy('startDate', 'asc')
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  /** Создать ивент */
  async function createEvent(data) {
    return await fs().collection('events').add({
      ...data,
      participants: [],
      createdAt: FV().serverTimestamp(),
    });
  }

  /** Записаться / отписаться от ивента */
  async function toggleEventJoin(eventId, discordId) {
    const ref  = fs().collection('events').doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const parts = snap.data().participants || [];
    if (parts.includes(discordId)) {
      await ref.update({ participants: FV().arrayRemove(discordId) });
      return 'removed';
    } else {
      await ref.update({ participants: FV().arrayUnion(discordId) });
      return 'added';
    }
  }

/** Завершить ивент и выдать призы */
async function finishEvent(eventId, presentIds) {
  const ref  = fs().collection('events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const ev   = snap.data();
  const prizes = ev.prizes || {};

  await ref.update({ status:'finished', attendance: presentIds });

  // Выдать призы каждому присутствующему
  for (const uid of presentIds) {
    const upd = {};
    if (prizes.currency) upd.currency = FV().increment(prizes.currency);
    if (prizes.xp)       upd.xp       = FV().increment(prizes.xp);
    if (prizes.elo) {
      const user  = await getUser(uid);
      // Если у пользователя нет ELO (старый профиль) или не задан, считаем 500
      const oldElo = (user?.elo !== undefined && user?.elo !== null) ? user.elo : 500;
      const newElo = Math.max(1, oldElo + prizes.elo);
      const rank   = gsRank(newElo);
      upd.elo      = newElo;
      upd.rank     = rank.id;
      upd.rankName = rank.name;
      upd.rankColor= rank.color;
      // Увеличиваем счётчик сыгранных игр (если поля нет, increment создаст его с 1)
      upd.gamesPlayed = FV().increment(1);
    }
    if (prizes.xp) {
      const user = await getUser(uid);
      const newXp = (user?.xp||0) + prizes.xp;
      upd.level = gsLevel(newXp);
    }
    upd.eventsParticipated = FV().increment(1);
    if (Object.keys(upd).length) await updateUser(uid, upd);
  }

  // Логировать
  await writeLog('event_finish', 'Ивент '+eventId, `Участники: ${presentIds.length}`, ev.title, 'Система');

  }

  // ════════════════════════════════════════════
  //  FORUM
  // ════════════════════════════════════════════

  /** Слушать темы (с фильтром по категории) */
  function listenTopics(category, cb) {
    let q = fs().collection('forum_topics').orderBy('createdAt','desc');
    if (category && category !== 'all') q = q.where('category','==',category);
    return q.onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  /** Слушать тему + комментарии */
  function listenTopic(topicId, cb) {
    return fs().collection('forum_topics').doc(topicId)
      .onSnapshot(snap => { if(snap.exists) cb({ id:snap.id, ...snap.data() }); });
  }
  function listenComments(topicId, cb) {
    return fs().collection('forum_comments')
      .where('topicId','==',topicId)
      .orderBy('createdAt','asc')
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  /** Создать тему */
  async function createTopic({ title, category, body, authorId, authorName, authorAvatar, asSystem }) {
    return await fs().collection('forum_topics').add({
      title, category, body,
      authorId:     asSystem ? 'system' : authorId,
      authorName:   asSystem ? 'Gray Squad' : authorName,
      authorAvatar: asSystem ? null : authorAvatar,
      isSystem:     !!asSystem,
      pinned:       false,
      readOnly:     false,
      likes:        [],
      dislikes:     [],
      commentCount: 0,
      createdAt:    FV().serverTimestamp(),
    });
  }

  /** Добавить комментарий */
  async function addComment({ topicId, authorId, authorName, authorAvatar, body }) {
    const batch = fs().batch();
    const cRef  = fs().collection('forum_comments').doc();
    const tRef  = fs().collection('forum_topics').doc(topicId);
    batch.set(cRef, {
      topicId, body,
      authorId, authorName, authorAvatar,
      likes:[], dislikes:[],
      createdAt: FV().serverTimestamp(),
    });
    batch.update(tRef, { commentCount: FV().increment(1) });
    await batch.commit();
  }

  /** Лайк / Дизлайк темы */
  async function reactTopic(topicId, uid, reaction) {
    const ref  = fs().collection('forum_topics').doc(topicId);
    const snap = await ref.get();
    const d    = snap.data();
    const likes    = d.likes    || [];
    const dislikes = d.dislikes || [];
    const upd = {};
    if (reaction === 'like') {
      upd.likes    = likes.includes(uid)    ? FV().arrayRemove(uid) : FV().arrayUnion(uid);
      upd.dislikes = FV().arrayRemove(uid);
    } else {
      upd.dislikes = dislikes.includes(uid) ? FV().arrayRemove(uid) : FV().arrayUnion(uid);
      upd.likes    = FV().arrayRemove(uid);
    }
    await ref.update(upd);
  }

  /** Удалить тему */
  async function deleteTopic(topicId) {
    await fs().collection('forum_topics').doc(topicId).delete();
    // Удалить комментарии
    const comments = await fs().collection('forum_comments').where('topicId','==',topicId).get();
    const b = fs().batch();
    comments.forEach(d => b.delete(d.ref));
    await b.commit();
  }

  /** Жалоба */
  async function reportContent({ reporterId, targetType, targetId, reason, description }) {
    await fs().collection('reports').add({
      reporterId, targetType, targetId, reason, description,
      status: 'new',
      adminResponse: null,
      createdAt: FV().serverTimestamp(),
    });
  }

  // ════════════════════════════════════════════
  //  SHOP
  // ════════════════════════════════════════════

  async function getShopItems() {
    const snap = await fs().collection('shop_items').where('active','==',true).get();
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }

  async function createPurchase({ userId, itemId, itemType, itemData, price }) {
    // Проверить баланс
    const user = await getUser(userId);
    if (!user || (user.currency||0) < price) throw new Error('Недостаточно монет');
    // Списать монеты
    await updateUser(userId, { currency: FV().increment(-price) });
    // Создать запись покупки (бот подхватит)
    await fs().collection('purchases').add({
      userId, itemId, itemType, itemData, price,
      processed: false,
      createdAt: FV().serverTimestamp(),
    });
    // Лог
    await writeLog('purchase', user.displayName||user.username, `-${price} монет`, itemType, 'Магазин');
  }

  async function getPurchaseHistory(userId, limitN=10) {
    const snap = await fs().collection('purchases')
      .where('userId','==',userId)
      .orderBy('createdAt','desc')
      .limit(limitN).get();
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  }

  // ════════════════════════════════════════════
  //  NOTIFICATIONS
  // ════════════════════════════════════════════

  function listenNotifications(userId, cb) {
    return fs().collection('notifications')
      .where('userId','in',[userId,'all'])
      .orderBy('createdAt','desc')
      .limit(20)
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  async function markNotifRead(notifId) {
    await fs().collection('notifications').doc(notifId).update({
      readAt: FV().serverTimestamp(),
    });
  }

  async function markAllNotifsRead(userId) {
    const snap = await fs().collection('notifications')
      .where('userId','in',[userId,'all'])
      .where('readAt','==',null).get();
    const b = fs().batch();
    snap.forEach(d => b.update(d.ref, { readAt: FV().serverTimestamp() }));
    await b.commit();
  }

  /** Отправить уведомление конкретному пользователю */
  async function sendNotification(userId, { type, title, message, link }) {
    await fs().collection('notifications').add({
      userId, type: type || 'announcement', title, message,
      link: link || null,
      createdAt: FV().serverTimestamp(),
      readAt: null,
    });
  }

  /** Отправить анонс всем (userId = 'all') */
  async function sendAnnouncement({ type, title, message, link }) {
    await fs().collection('notifications').add({
      userId: 'all', type: type || 'announcement', title, message,
      link: link || null,
      createdAt: FV().serverTimestamp(),
      readAt: null,
    });
  }

  // ════════════════════════════════════════════
  //  CONFIG
  // ════════════════════════════════════════════

  async function getConfig() {
    const snap = await fs().collection('config').doc('main').get();
    const def = { xpPerMessage:1, xpPer10MinVoice:5, globalXpMultiplier:1,
      dailyBonus:25, levelUpMultiplier:10, achievementBonus:50 };
    return snap.exists ? { ...def, ...snap.data() } : def;
  }
  async function setConfig(fields) {
    await fs().collection('config').doc('main').set(fields, { merge:true });
  }

  // ════════════════════════════════════════════
  //  LOGS
  // ════════════════════════════════════════════

  async function writeLog(type, target, change, reason, by) {
    await fs().collection('logs').add({
      type, targetUsername:target, change, reason, byWhom:by,
      createdAt: FV().serverTimestamp(),
    });
  }

  function listenLogs(cb, limitN=50) {
    return fs().collection('logs').orderBy('createdAt','desc').limit(limitN)
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }

  // ════════════════════════════════════════════
  //  WARNS
  // ════════════════════════════════════════════

  async function addWarn(discordId, { reason, expiresAt, issuedBy }) {
    const user = await getUser(discordId);
    if (!user) return;
    const warn = {
      id: 'w_'+Date.now(), reason,
      issuedBy, issuedAt: new Date().toISOString(), expiresAt: expiresAt||null,
    };
    await updateUser(discordId, {
      warnings: firebase.firestore.FieldValue.arrayUnion(warn),
    });
    await fs().collection('notifications').add({
      userId: discordId, type:'warn',
      title:`⚠️ Получен варн`,
      message:`Причина: ${reason}. Выдал: ${issuedBy}`,
      createdAt: FV().serverTimestamp(), readAt:null,
    });
    await writeLog('warn', user.displayName||user.username, '+1 варн', reason, issuedBy);
  }

  // ════════════════════════════════════════════
  //  REPORTS (admin)
  // ════════════════════════════════════════════

  function listenReports(cb) {
    return fs().collection('reports').orderBy('createdAt','desc')
      .onSnapshot(snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  }
  async function closeReport(reportId, { adminResponse, action }) {
    await fs().collection('reports').doc(reportId).update({
      status:'closed', adminResponse, action,
      closedAt: FV().serverTimestamp(),
    });
  }

  // ════════════════════════════════════════════
  //  DAILY BONUS
  // ════════════════════════════════════════════

  async function claimDaily(discordId) {
    const user = await getUser(discordId);
    if (!user) return { ok:false, reason:'Профиль не найден' };
    const cfg  = await getConfig();
    const last = user.lastDailyBonus?.toDate?.() || null;
    if (last && (Date.now()-last) < 86400000)
      return { ok:false, reason:`Следующий бонус через ~${Math.ceil((86400000-(Date.now()-last))/3600000)}ч` };
    const bonus = cfg.dailyBonus||25;
    await updateUser(discordId, {
      currency: FV().increment(bonus),
      lastDailyBonus: FV().serverTimestamp(),
    });
    return { ok:true, bonus };
  }

  return {
    getUser, listenUsers, updateUser, listenUser,
    listenVoice,
    listenEvents, createEvent, toggleEventJoin, finishEvent,
    listenTopics, listenTopic, listenComments, createTopic, addComment,
    reactTopic, deleteTopic, reportContent,
    getShopItems, createPurchase, getPurchaseHistory,
    listenNotifications, markNotifRead, markAllNotifsRead,
    sendNotification, sendAnnouncement,
    getConfig, setConfig,
    writeLog, listenLogs,
    addWarn, listenReports, closeReport,
    claimDaily,
  };
})();


// ════════════════════════════════════════════
//  GAME FILTERS (для ивентов)
// ════════════════════════════════════════════

/** Слушать список игр (фильтры) */
function listenGameFilters(cb) {
  return fs().collection('game_filters').doc('main')
    .onSnapshot(snap => {
      if (snap.exists) cb(snap.data().games || []);
      else cb([]);
    });
}

/** Обновить список игр (только creator) */
async function setGameFilters(games) {
  await fs().collection('game_filters').doc('main').set({ games }, { merge: true });
}

/** Добавить новую игру */
async function addGameFilter(game) {
  const ref = fs().collection('game_filters').doc('main');
  await ref.update({
    games: firebase.firestore.FieldValue.arrayUnion(game)
  });
}

/** Удалить игру по id */
async function removeGameFilter(gameId) {
  const ref = fs().collection('game_filters').doc('main');
  const snap = await ref.get();
  if (!snap.exists) return;
  const games = snap.data().games || [];
  const newGames = games.filter(g => g.id !== gameId);
  await ref.update({ games: newGames });
}