const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.discordAuth = functions.https.onRequest((req, res) => {
  // Явно отвечаем на предварительный запрос OPTIONS
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  // Для POST-запросов включаем CORS и выполняем логику
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { code } = req.body;
    const redirectUri = req.body.redirectUri || req.body.redirect_uri;
    if (!code || !redirectUri) return res.status(400).json({ error: "Missing code or redirectUri" });

    // Получаем ключи из конфигурации (пока работает)
    const CLIENT_ID      = functions.config().discord.client_id;
    const CLIENT_SECRET  = functions.config().discord.client_secret;
    const BOT_TOKEN      = functions.config().discord.bot_token;
    const GUILD_ID       = functions.config().discord.guild_id;
    const MEMBER_ROLE_ID = functions.config().discord.member_role_id;

    if (!CLIENT_ID || !CLIENT_SECRET || !BOT_TOKEN) {
      console.error("Missing Discord credentials in functions config");
      return res.status(500).json({ error: "Server configuration error" });
    }

    try {
      // Обмен кода на токен
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return res.status(400).json({ error: "Discord token exchange failed", details: tokenData });
      }

      // Получаем данные пользователя
      const discordUser = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }).then(r => r.json());

      let displayName = discordUser.global_name || discordUser.username;
      let discordRoles = [];
      let isMember = false;

      // Роли на сервере
      try {
        const memberRes = await fetch(
          `https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        if (memberRes.ok) {
          const memberData = await memberRes.json();
          if (memberData.nick) displayName = memberData.nick;
          const rolesRes = await fetch(
            `https://discord.com/api/guilds/${GUILD_ID}/roles`,
            { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
          );
          if (rolesRes.ok) {
            const allRoles = await rolesRes.json();
            discordRoles = (memberData.roles || []).map(roleId => {
              const role = allRoles.find(r => r.id === roleId);
              return role ? { id: role.id, name: role.name, color: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "#99AAB5" } : null;
            }).filter(Boolean);
            isMember = (memberData.roles || []).includes(MEMBER_ROLE_ID);
          }
        }
      } catch (_) {}

      // Аватар
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
        : null;

      // Сохраняем в Firestore
      const db = admin.firestore();
      const userRef = db.collection("users").doc(discordUser.id);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        await userRef.set({
          discordId: discordUser.id,
          username: discordUser.username,
          displayName,
          avatarUrl,
          role: isMember ? "member" : "user",
          elo: 500,
          currency: 0,
          level: 0,
          xp: 0,
          gamesPlayed: 0,
          totalVoiceMinutes: 0,
          xpMultiplier: 1,
          xpMultiplierExpiresAt: null,
          achievements: [],
          warnings: [],
          forumBanExpiresAt: null,
          canCreateEvents: false,
          customColor: null,
          title: null,
          discordRoles,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const upd = { username: discordUser.username, displayName, avatarUrl, discordRoles };
        if (userSnap.data().role === "user" && isMember) upd.role = "member";
        await userRef.update(upd);
      }

      const gsUser = (await userRef.get()).data();
      const firebaseToken = await admin.auth().createCustomToken(discordUser.id);

      return res.json({ ok: true, user: gsUser, firebaseToken });
    } catch (err) {
      console.error("discordAuth error:", err);
      return res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });
});