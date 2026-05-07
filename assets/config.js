// ╔══════════════════════════════════════════════╗
// ║  GRAY SQUAD — config.js                      ║
// ╚══════════════════════════════════════════════╝
const GS = {
  botUrl: "https://graysquad-bot.onrender.com",
  firebase: {
    apiKey:            "AIzaSyBAFBnLzsJdUKLC-QgoiPt38g6HsDoY3lo",
    authDomain:        "gray-squad-2e791.firebaseapp.com",
    projectId:         "gray-squad-2e791",
    storageBucket:     "gray-squad-2e791.firebasestorage.app",
    messagingSenderId: "1098766397118",
    appId:             "1:1098766397118:web:9c6f2e5fdb165e6817b8ef",
  },
  discord: {
    clientId:    "1492542704834576609",
    redirectUri: window.location.origin + "/callback.html",
    scopes:      ["identify", "guilds.members.read"],
  },
  guild: {
    id:           "650100433007804426",
    memberRoleId: "1083391456665927721",
  },

  // ⬇️ ВСТАВЬ СЮДА URL после `firebase deploy --only functions`
  // Формат: https://us-central1-gray-squad-2e791.cloudfunctions.net/discordAuth
  authFunctionUrl: "https://us-central1-gray-squad-2e791.cloudfunctions.net/discordAuth",

  // ── Пороги рангов (compositeScore из elo.js) ────────────────
  ranks: [
    { id:0,  name:'Неактивен',   color:'#6c757d', icon:'💤', min:0,     max:499   },
    { id:1,  name:'Железо',      color:'#8B8B8B', icon:'⚙️',  min:500,   max:899   },
    { id:2,  name:'Бронза',      color:'#CD7F32', icon:'🥉',  min:900,   max:1499  },
    { id:3,  name:'Серебро',     color:'#C0C0C0', icon:'🥈',  min:1500,  max:2299  },
    { id:4,  name:'Золото',      color:'#FFD700', icon:'🥇',  min:2300,  max:3299  },
    { id:5,  name:'Платина',     color:'#E5E4E2', icon:'💠',  min:3300,  max:4699  },
    { id:6,  name:'Алмаз',       color:'#B9F2FF', icon:'💎',  min:4700,  max:6499  },
    { id:7,  name:'Мастер',      color:'#A335EE', icon:'👑',  min:6500,  max:9199  },
    { id:8,  name:'Грандмастер', color:'#FF8C00', icon:'🔥',  min:9200,  max:12999 },
    { id:9,  name:'Элитный',     color:'#FF4500', icon:'⚡',  min:13000, max:18999 },
    { id:10, name:'Легенда',     color:'#FF0000', icon:'🌟',  min:19000, max:Infinity },
  ],

  // ── Веса формулы ELO (меняются через админку → config.eloFormula) ──
  eloFormula: {
    w_level:          25,   // очков ELO за каждый уровень
    w_xp_div:        120,   // XP делим на это число
    w_voice_div:       6,   // голосовые минуты делим на это
    w_coin:          1.5,   // sqrt(монеты) × это число
    elo_floor:       500,   // base_elo не падает ниже этого
    eventEloBase:     80,   // базовые очки за участие в ивенте
    eventEloWinMult: 3.5,   // множитель победителя
    eventEloDecay:   0.65,  // затухание штрафа по местам
    eventEloMaxLoss:  35,   // максимум потерь за один ивент
  },
};

// ── Составной ELO-счёт пользователя ──────────────────────────
function gsCompositeElo(user, weights) {
  if (typeof computeCompositeElo !== 'undefined') {
    return computeCompositeElo(user, weights || GS.eloFormula);
  }
  // Fallback: только base_elo
  return user.elo || 500;
}

// ── Ранг по составному счёту ─────────────────────────────────
// scoreOrUser — число (уже вычисленный score) или объект пользователя
function gsRank(scoreOrUser, weights) {
  const score = (scoreOrUser && typeof scoreOrUser === 'object')
    ? gsCompositeElo(scoreOrUser, weights)
    : (scoreOrUser || 0);
  if (typeof getRankByComposite !== 'undefined') return getRankByComposite(score);
  return GS.ranks.find(r => score >= r.min && score <= r.max) || GS.ranks[GS.ranks.length - 1];
}
function gsLevel(xp) { return Math.floor(Math.sqrt((xp || 0) / 100)); }
function gsXpProgress(xp) {
  const l = gsLevel(xp), cur = l * l * 100, nxt = (l + 1) * (l + 1) * 100;
  return { level: l, pct: Math.round((xp - cur) / (nxt - cur) * 100), cur, nxt };
}
function fmtNum(n) { return (n || 0).toLocaleString('ru-RU'); }
function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return d.toLocaleDateString('ru-RU');
}
