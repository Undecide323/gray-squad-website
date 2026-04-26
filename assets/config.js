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

  ranks: [
    { id: 0,  name: "Неактивен",    color: "#6c757d", min: 0,    max: 500      },
    { id: 1,  name: "Железо",       color: "#8B8B8B", min: 501,  max: 800      },
    { id: 2,  name: "Бронза",       color: "#CD7F32", min: 501,  max: 800      },
    { id: 3,  name: "Серебро",      color: "#C0C0C0", min: 801,  max: 1000     },
    { id: 4,  name: "Золото",       color: "#FFD700", min: 1001, max: 1200     },
    { id: 5,  name: "Платина",      color: "#E5E4E2", min: 1201, max: 1400     },
    { id: 6,  name: "Алмаз",        color: "#B9F2FF", min: 1401, max: 1600     },
    { id: 7,  name: "Мастер",       color: "#A335EE", min: 1601, max: 1800     },
    { id: 8,  name: "Грандмастер",  color: "#FF8C00", min: 1801, max: 2000     },
    { id: 9,  name: "Элитный",      color: "#FF4500", min: 2001, max: 2300     },
    { id: 10, name: "Легенда",      color: "#FF0000", min: 2301, max: Infinity },
  ],
};

function gsRank(elo) {
  return GS.ranks.find(r => elo >= r.min && elo <= r.max) || GS.ranks.at(-1);
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
