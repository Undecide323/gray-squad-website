const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { defineSecret } = require("firebase-functions/params");

// Объявляем секреты
const discordClientId = defineSecret("DISCORD_CLIENT_ID");
const discordClientSecret = defineSecret("DISCORD_CLIENT_SECRET");
const discordBotToken = defineSecret("DISCORD_BOT_TOKEN");

// Значения, которые не секретны, можно оставить как параметры
const discordGuildId = defineString("DISCORD_GUILD_ID");
const discordMemberRoleId = defineString("DISCORD_MEMBER_ROLE_ID");

admin.initializeApp();

exports.discordAuth = functions
  .runWith({
    secrets: [discordClientId, discordClientSecret, discordBotToken]
  })
  .https.onRequest((req, res) => {
    // Ручная обработка CORS
    res.set("Access-Control-Allow-Origin", "https://graysquad.fun");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { code, redirectUri } = req.body;
    if (!code || !redirectUri) {
      return res.status(400).json({ error: "Missing code or redirectUri" });
    }

    // Запускаем асинхронную часть
    handleAuth(req, res, code, redirectUri).catch(err => {
      console.error("discordAuth error:", err);
      res.status(500).json({ error: "Internal server error", message: err.message });
    });
  });

async function handleAuth(req, res, code, redirectUri) {
  const CLIENT_ID = discordClientId.value();
  const CLIENT_SECRET = discordClientSecret.value();
  const BOT_TOKEN = discordBotToken.value();
  const GUILD_ID = "650100433007804426"; // Ваш Guild ID
  const MEMBER_ROLE_ID = "1083391456665927721"; // Ваша Member Role ID

  // ... (вставьте сюда всю логику из вашей прошлой функции:
  // обмен кода на токен, получение данных Discord, создание/обновление
  // профиля в Firestore, создание кастомного токена)
  // В конце верните ответ:
  // return res.json({ ok: true, user: gsUser, firebaseToken });
}