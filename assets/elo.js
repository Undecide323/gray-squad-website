// ═══════════════════════════════════════════════════════════
//  GRAY SQUAD — elo.js
//  Составной ELO: лига формируется из нескольких метрик.
//  Упасть ОЧЕНЬ тяжело — большинство компонентов только растут.
// ═══════════════════════════════════════════════════════════

/**
 * ФОРМУЛА:
 *
 *  compositeScore =
 *      base_elo                                   ← из ивентов (может падать)
 *    + level    × w_level                         ← уровень × коэффициент
 *    + xp       / w_xp_div                        ← XP делим на делитель
 *    + voice_minutes / w_voice_div                ← минуты в голосовых
 *    + √(currency)  × w_coin                     ← монеты через корень (антиинфляция)
 *
 *  Ключевая идея: base_elo — единственный компонент, который МОЖЕТ упасть.
 *  Все остальные только растут. Поэтому «пол» лиги поднимается с активностью.
 *
 *  base_elo при этом ограничен снизу: max(base_elo, eloFloor)
 *  где eloFloor = начальный ELO (500) — нельзя упасть ниже старта.
 *
 *  Пример для активного игрока (level=30, xp=20000, voice=500, coins=5000):
 *    500 (base) + 30×25 + 20000/120 + 500/6 + √5000×1.5
 *    = 500 + 750 + 166 + 83 + 106 = 1605 → Мастер
 */

// ── Дефолтные веса формулы ───────────────────────────────────
const ELO_FORMULA_DEFAULTS = {
  w_level:     25,    // Очки ELO за каждый уровень
  w_xp_div:    120,   // XP делим на это число (меньше = быстрее растёт)
  w_voice_div: 6,     // Минуты голоса делим на это число
  w_coin:      1.5,   // Монеты: sqrt(coins) × это число
  elo_floor:   500,   // Минимальный base_elo (нельзя упасть ниже)
};

// ── Пороги рангов (по compositeScore) ────────────────────────
const ELO_RANK_TIERS = [
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
];

// ── Главная функция расчёта ───────────────────────────────────
/**
 * Вычислить составной ELO-счёт игрока.
 * @param {object} user     - документ пользователя из Firestore
 * @param {object} weights  - веса из config.eloFormula (или дефолты)
 * @returns {number}        - целое число, составной счёт
 */
function computeCompositeElo(user, weights) {
  const w = { ...ELO_FORMULA_DEFAULTS, ...(weights || {}) };

  // Базовый ELO из ивентов (не падает ниже пола)
  const baseElo = Math.max(user.elo || 500, w.elo_floor);

  // Компонент уровня
  const levelBonus = (user.level || 0) * w.w_level;

  // Компонент XP (линейный делитель — понятен и предсказуем)
  const xpBonus = Math.floor((user.xp || 0) / w.w_xp_div);

  // Компонент голосовых минут
  const voiceBonus = Math.floor((user.totalVoiceMinutes || 0) / w.w_voice_div);

  // Компонент монет (квадратный корень — защита от накопления)
  const coinBonus = Math.floor(Math.sqrt(user.currency || 0) * w.w_coin);

  return baseElo + levelBonus + xpBonus + voiceBonus + coinBonus;
}

/**
 * Разбивка компонентов для UI (показывает из чего складывается счёт).
 */
function eloBreakdown(user, weights) {
  const w = { ...ELO_FORMULA_DEFAULTS, ...(weights || {}) };
  const baseElo   = Math.max(user.elo || 500, w.elo_floor);
  const levelBonus= (user.level || 0) * w.w_level;
  const xpBonus   = Math.floor((user.xp || 0) / w.w_xp_div);
  const voiceBonus= Math.floor((user.totalVoiceMinutes || 0) / w.w_voice_div);
  const coinBonus = Math.floor(Math.sqrt(user.currency || 0) * w.w_coin);
  const total     = baseElo + levelBonus + xpBonus + voiceBonus + coinBonus;

  return {
    total,
    components: [
      { key:'base_elo',    label:'ELO из ивентов', value: baseElo,    icon:'🏆', canDrop: true },
      { key:'level',       label:'Уровень',         value: levelBonus, icon:'⚡', canDrop: false },
      { key:'xp',          label:'Опыт',            value: xpBonus,    icon:'📈', canDrop: false },
      { key:'voice',       label:'Голосовые',       value: voiceBonus, icon:'🎙️', canDrop: false },
      { key:'coins',       label:'Монеты',          value: coinBonus,  icon:'💰', canDrop: false },
    ],
  };
}

/**
 * Получить ранг по compositeScore.
 * @param {number} score
 * @param {Array}  tiers  - опционально кастомные пороги из config
 */
function getRankByComposite(score, tiers) {
  const list = (tiers && tiers.length) ? tiers : ELO_RANK_TIERS;
  return list.find(r => score >= r.min && score <= r.max) || list[list.length - 1];
}

/**
 * Прогресс к следующему рангу (0–100%).
 */
function eloProgress(score, tiers) {
  const list   = (tiers && tiers.length) ? tiers : ELO_RANK_TIERS;
  const rank   = getRankByComposite(score, list);
  if (rank.max === Infinity) return { pct: 100, pointsLeft: 0, nextRank: null };
  const range  = rank.max - rank.min + 1;
  const pct    = Math.round(((score - rank.min) / range) * 100);
  const next   = list.find(r => r.id === rank.id + 1) || null;
  return { pct: Math.min(pct, 99), pointsLeft: rank.max - score + 1, nextRank: next };
}

/**
 * Сколько очков принесёт конкретный ивент-результат.
 * place=1 → победа; place=2 → второе место, и т.д.
 */
function eloEventDelta(place, totalPlayers, config) {
  const base    = config?.eventEloBase    || 80;   // базовые очки за участие
  const winMult = config?.eventEloWinMult || 3.5;  // множитель победы
  const decay   = config?.eventEloDecay   || 0.65; // затухание по местам

  if (totalPlayers <= 1) return base;

  const normalized = (totalPlayers - place) / (totalPlayers - 1); // 1.0 = 1е место, 0 = последнее
  const raw = Math.round(base + base * (winMult - 1) * Math.pow(normalized, 1 / decay));
  // Минимум — всегда хотя бы базовые (проиграть не так страшно)
  return Math.max(raw, Math.round(base * 0.25));
}

/**
 * Штраф за поражение (вычитается из base_elo).
 * Ограничен — нельзя потерять больше maxLoss за раз.
 */
function eloEventLoss(place, totalPlayers, config) {
  const maxLoss = config?.eventEloMaxLoss || 35;  // максимальные потери за 1 ивент
  if (place === 1) return 0;  // победитель не теряет
  const normalized = (place - 1) / (totalPlayers - 1); // 0 = 2е место, 1 = последнее
  return Math.round(maxLoss * Math.pow(normalized, 1.5));
}

// ── Экспорт (работает и в браузере и в Node.js) ──────────────
if (typeof module !== 'undefined') {
  module.exports = {
    ELO_FORMULA_DEFAULTS, ELO_RANK_TIERS,
    computeCompositeElo, eloBreakdown,
    getRankByComposite, eloProgress,
    eloEventDelta, eloEventLoss,
  };
}
