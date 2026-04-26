const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const DISCORD_API = "https://discord.com/api/v10";

exports.discordAuth = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, redirectUri } = req.body;
  if (!code || !redirectUri) {
    return res.status(400).json({ error: "Missing code or redirectUri" });
  }

  const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
  const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
  const BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN;
  const GUILD_ID      = process.env.DISCORD_GUILD_ID;
  const MEMBER_ROLE_ID = process.env.DISCORD_MEMBER_ROLE_ID;

  try {
    // 1. Обмен кода на access token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
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
    const accessToken = tokenData.access_token;

    // 2. Профиль пользователя
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const discordUser = await userRes.json();

    // 3. Данные участника гильдии
    let displayName = discordUser.global_name || discordUser.username;
    let discordRoles = [];
    let isMember = false;

    try {
      const memberRes = await fetch(`${DISCORD_API}/users/@me/guilds/${GUILD_ID}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        if (memberData.nick) displayName = memberData.nick;

        const rolesRes = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, {
          headers: { Authorization: `Bot ${BOT_TOKEN}` },
        });
        if (rolesRes.ok) {
          const allRoles = await rolesRes.json();
          discordRoles = (memberData.roles || []).map(roleId => {
            const role = allRoles.find(r => r.id === roleId);
            return role
              ? { id: role.id, name: role.name, color: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "#99AAB5" }
              : null;
          }).filter(Boolean);
          isMember = (memberData.roles || []).includes(MEMBER_ROLE_ID);
        }
      }
    } catch (_) { /* продолжаем с базовыми данными */ }

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : null;

    // 4. Создаём/обновляем пользователя в Firestore
    const db = admin.firestore();
    const userRef = db.collection("users").doc(discordUser.id);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      await userRef.set({
        discordId:              discordUser.id,
        username:               discordUser.username,
        displayName,
        avatarUrl,
        role:                   isMember ? "member" : "user",
        elo:                    500,
        rank:                   0,
        rankName:               "Калибровка",
        rankColor:              "#6c757d",
        currency:               0,
        level:                  0,
        xp:                     0,
        gamesPlayed:            0,
        totalVoiceMinutes:      0,
        xpMultiplier:           1,
        xpMultiplierExpiresAt:  null,
        achievements:           [],
        warnings:               [],
        forumBanExpiresAt:      null,
        canCreateEvents:        false,
        customColor:            null,
        title:                  null,
        discordRoles,
        createdAt:              admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const updates = {
        username:     discordUser.username,
        displayName,
        avatarUrl,
        discordRoles,
      };
      if (userSnap.data().role === "user" && isMember) updates.role = "member";
      await userRef.update(updates);
    }

    const gsUser = (await userRef.get()).data();

    // 5. Генерируем Firebase custom token
    const firebaseToken = await admin.auth().createCustomToken(discordUser.id);

    return res.json({ ok: true, firebaseToken, gsUser });

  } catch (err) {
    console.error("discordAuth error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
});
