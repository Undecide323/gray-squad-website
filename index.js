// ============================================================
//  GRAY SQUAD — Firebase Cloud Function
//  Discord OAuth2 → Firebase Custom Token
//
//  Деплой: firebase deploy --only functions
// ============================================================
const functions   = require('firebase-functions');
const admin       = require('firebase-admin');
const fetch       = require('node-fetch');
const cors        = require('cors')({ origin: true });

admin.initializeApp();
const db = admin.firestore();

exports.discordAuth = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ error: 'Нет кода авторизации' });

    const CLIENT_ID     = functions.config().discord.client_id;
    const CLIENT_SECRET = functions.config().discord.client_secret;

    try {
      // 1. Обмен кода на токен Discord
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type:    'authorization_code',
          code,
          redirect_uri:  redirectUri,
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) return res.status(400).json({ error: tokenData.error_description || tokenData.error });

      // 2. Получить данные пользователя из Discord
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const discordUser = await userRes.json();

      // 3. Получить ник и роли с сервера
      const GUILD_ID = functions.config().discord.guild_id;
      let displayName = discordUser.global_name || discordUser.username;
      let discordRoles = [];
      let memberRole = 'user';

      try {
        const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (memberRes.ok) {
          const memberData = await memberRes.json();
          // Никнейм на сервере (именно это имя использовать)
          if (memberData.nick) displayName = memberData.nick;

          // Получить данные ролей с сервера
          const guildRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
            headers: { Authorization: `Bot ${functions.config().discord.bot_token}` },
          });
          if (guildRes.ok) {
            const allRoles = await guildRes.json();
            const roleMap = Object.fromEntries(allRoles.map(r=>[r.id,r]));
            discordRoles = (memberData.roles||[]).map(id => roleMap[id]).filter(Boolean).map(r=>({ id:r.id, name:r.name, color: r.color ? '#'+r.color.toString(16).padStart(6,'0') : '#888888' }));
            // Проверить роль участника
            const MEMBER_ROLE_ID = functions.config().discord.member_role_id;
            if (MEMBER_ROLE_ID && memberData.roles.includes(MEMBER_ROLE_ID)) memberRole = 'member';
          }
        }
      } catch (guildErr) {
        console.warn('Guild member fetch failed:', guildErr.message);
      }

      // 4. Создать/обновить документ в Firestore
      const userRef = db.collection('users').doc(discordUser.id);
      const existing = await userRef.get();

      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`
        : null;

      if (!existing.exists) {
        await userRef.set({
          discordId:    discordUser.id,
          username:     discordUser.username,        // Discord username (без #)
          displayName:  displayName,                 // Ник на сервере
          avatarUrl,
          role:         memberRole,
          elo:          500, rank: 0, rankName: 'Калибровка', rankColor: '#6c757d',
          currency: 0, level: 0, xp: 0, totalVoiceMinutes: 0,
          xpMultiplier: 1, xpMultiplierExpiresAt: null,
          achievements: [], warnings: [],
          forumBanExpiresAt: null, canCreateEvents: false,
          customColor: null, title: null,
          discordRoles,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Обновить живые поля при каждом входе
        const upd = { username: discordUser.username, displayName, avatarUrl, discordRoles };
        if (existing.data().role === 'user' && memberRole === 'member') upd.role = 'member';
        await userRef.update(upd);
      }

      const gsUser = { id: discordUser.id, ...(await userRef.get()).data() };

      // 5. Создать Firebase Custom Token (uid = discordId)
      const firebaseToken = await admin.auth().createCustomToken(discordUser.id);

      return res.json({ ok: true, firebaseToken, gsUser });

    } catch (e) {
      console.error('discordAuth error:', e);
      return res.status(500).json({ error: e.message });
    }
  });
});
