// Global Mine Action Hub — website worker.
// Serves the site from /public, sends callback requests to Telegram
// and answers visitor questions in the site chat.
//
// Secrets (Cloudflare → website → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — token from @BotFather
//   TELEGRAM_CHAT_ID   — chat that receives callback requests
//   ANTHROPIC_API_KEY  — optional. If set, the chat uses Claude; otherwise Cloudflare Workers AI (free tier).

import { SYSTEM_PROMPT } from "./knowledge.js";

const CLAUDE_MODEL = "claude-haiku-5-5";
const WORKERS_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/* ---------- callback form → Telegram ---------- */

async function handleCallback(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  // Spam trap: real visitors never fill this hidden field.
  if (clean(data.website, 200)) return json({ ok: true });

  const name = clean(data.name, 100);
  const phone = clean(data.phone, 40);
  const topic = clean(data.topic, 60) || "—";
  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const lang = LANGS[clean(data.lang, 5)] || "—";

  if (!name || phone.replace(/\D/g, "").length < 7 || data.consent !== true) {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ ok: false, error: "not_configured" }, 500);
  }

  const time = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" });
  const country = request.cf?.country || "—";
  const text =
    `📞 Новая заявка на звонок — sydanukrainalle.org\n\n` +
    `Имя: ${name}\n` +
    `Телефон: ${phone}\n` +
    `Тема: ${topic}\n` +
    `Язык сайта: ${lang}\n` +
    `Страна посетителя: ${country}\n` +
    `Время (Хельсинки): ${time}`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });

  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true });
}

/* ---------- dog programme applications → Telegram ---------- */

async function handleJoin(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  if (clean(data.website, 200)) return json({ ok: true }); // spam trap
  const name = clean(data.name, 100);
  const email = clean(data.email, 120);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data.consent !== true) return json({ ok: false, error: "invalid" }, 400);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({ ok: false, error: "not_configured" }, 500);

  const TYPES = { Kennel: "Питомник / заводчик предлагает собаку", Handler: "Будущий кинолог / волонтёр", Other: "Другое" };
  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const message = String(data.message ?? "").trim().slice(0, 600) || "—";
  const text =
    `🐕 Заявка в программу собак — sydanukrainalle.org\n\n` +
    `Кто: ${TYPES[clean(data.type, 20)] || "—"}\n` +
    `Имя: ${name}\n` +
    `Email: ${email}\n` +
    `Телефон: ${clean(data.phone, 40) || "—"}\n` +
    `Сообщение: ${message}\n` +
    `Язык сайта: ${LANGS[clean(data.lang, 5)] || "—"}\n` +
    `Страна посетителя: ${request.cf?.country || "—"}\n` +
    `Время (Хельсинки): ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" })}`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true });
}

/* ---------- donation interest list → Telegram ---------- */

async function handleNotify(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  if (clean(data.website, 200)) return json({ ok: true }); // spam trap

  const email = clean(data.email, 120);
  const name = clean(data.name, 100) || "—";
  const type = clean(data.type, 60) || "—";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data.consent !== true) {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({ ok: false, error: "not_configured" }, 500);

  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const time = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" });
  const text =
    `💛 Хочет поддержать проект — sydanukrainalle.org\n\n` +
    `Email: ${email}\n` +
    `Имя: ${name}\n` +
    `Вариант: ${type}\n` +
    `Язык сайта: ${LANGS[clean(data.lang, 5)] || "—"}\n` +
    `Страна посетителя: ${request.cf?.country || "—"}\n` +
    `Время (Хельсинки): ${time}`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true });
}

/* ---------- site chat ---------- */

const MAX_MESSAGE = 1000;   // characters per message
const MAX_TURNS = 10;       // messages of history sent to the model
const MAX_ANSWER = 500;     // tokens per answer

function prepareHistory(raw) {
  if (!Array.isArray(raw)) return null;
  let msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE) }))
    .filter((m) => m.content)
    .slice(-MAX_TURNS);
  while (msgs.length && msgs[0].role !== "user") msgs.shift(); // must start with the visitor
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

async function askClaude(env, messages) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: MAX_ANSWER, system: SYSTEM_PROMPT, messages }),
  });
  if (!r.ok) throw new Error(`claude_${r.status}`);
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

async function askWorkersAI(env, messages) {
  const out = await env.AI.run(WORKERS_AI_MODEL, {
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    max_tokens: MAX_ANSWER,
    temperature: 0.3,
  });
  return String(out?.response || "").trim();
}

async function handleChat(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const messages = prepareHistory(data.messages);
  if (!messages) return json({ ok: false, error: "invalid" }, 400);

  try {
    let answer = "";
    if (env.ANTHROPIC_API_KEY) answer = await askClaude(env, messages);
    else if (env.AI) answer = await askWorkersAI(env, messages);
    else return json({ ok: false, error: "not_configured" }, 500);

    if (!answer) throw new Error("empty_answer");
    return json({ ok: true, answer: answer.replace(/\*\*/g, "") });
  } catch (err) {
    console.error("chat_error", err?.message || err);
    return json({ ok: false, error: "ai_unavailable" }, 502);
  }
}

/* ---------- Telegram bot: answers visitors with the same AI as the site ---------- */

const TG_TEXT = {
  uk: {
    start: "Вітаю! Це помічник Global Mine Action Hub — програми Sydän Ukrainalle ry.\n\nМи готуємо службових собак для пошуку мін та їхніх інструкторів і розробляємо сучасні системи виявлення вибухонебезпечних предметів.\n\nНапишіть своє запитання — про нашу роботу, партнерство чи мінну безпеку.",
    safety: "Якщо ви побачили підозрілий предмет:\n\n◉ Не торкайтеся його і не підходьте ближче.\n◉ Запам’ятайте місце.\n◉ Виходьте тим самим шляхом, яким прийшли.\n◉ Телефонуйте 101 або 112.",
    textOnly: "Поки що я розумію лише текстові повідомлення. Напишіть, будь ласка, своє запитання текстом.",
    site: "Сайт", call: "Замовити дзвінок", busy: "Вибачте, зараз я не можу відповісти. Напишіть на info@sydanukrainalle.org або залиште номер на сайті, і ми вам передзвонимо.",
  },
  fi: {
    start: "Hei! Tämä on Global Mine Action Hubin avustaja. Global Mine Action Hub on Sydän Ukrainalle ry:n ohjelma.\n\nKoulutamme miinakoiria ja niiden kouluttajia sekä kehitämme nykyaikaisia räjähteiden havaitsemisjärjestelmiä.\n\nKirjoita kysymyksesi työstämme, kumppanuudesta tai miinaturvallisuudesta.",
    safety: "Jos näet epäilyttävän esineen:\n\n◉ Älä koske siihen äläkä mene lähemmäs.\n◉ Paina paikka mieleesi.\n◉ Poistu samaa reittiä kuin tulit.\n◉ Soita Ukrainassa 101 tai 112.",
    textOnly: "Ymmärrän toistaiseksi vain tekstiviestejä. Kirjoita kysymyksesi, kiitos.",
    site: "Verkkosivusto", call: "Pyydä soittoa", busy: "Valitettavasti en pysty vastaamaan juuri nyt. Kirjoita osoitteeseen info@sydanukrainalle.org tai jätä numerosi sivustolla, niin soitamme sinulle.",
  },
  en: {
    start: "Hello! This is the assistant of Global Mine Action Hub, a programme of Sydän Ukrainalle ry.\n\nWe train mine detection dogs and their instructors, and develop modern systems for detecting explosive ordnance.\n\nWrite your question about our work, partnerships or mine safety.",
    safety: "If you see a suspicious object:\n\n◉ Do not touch it and do not move closer.\n◉ Remember the place.\n◉ Leave by the same route you came.\n◉ Call 101 or 112 in Ukraine.",
    textOnly: "For now I can only read text messages. Please type your question.",
    site: "Website", call: "Request a call", busy: "Sorry, I can’t answer right now. Please write to info@sydanukrainalle.org or leave your number on our website and we will call you back.",
  },
};
const tgLang = (code) => {
  const c = String(code || "").slice(0, 2);
  return c === "uk" || c === "ru" ? "uk" : c === "fi" ? "fi" : "en";
};
const COMMAND_QUESTIONS = {
  "/about": "What is Global Mine Action Hub and what do you do?",
  "/technology": "Tell me about your detection methods: dogs, drones and bees.",
  "/partner": "How can an organisation become a partner or support you?",
  "/contact": "How can I contact your team?",
};

async function tgSend(env, chatId, text, lang, withButtons) {
  const t = TG_TEXT[lang];
  const site = lang === "en" ? "https://sydanukrainalle.org/" : `https://sydanukrainalle.org/${lang}/`;
  const body = { chat_id: chatId, text };
  if (withButtons) {
    body.reply_markup = { inline_keyboard: [[{ text: t.site, url: site }, { text: t.call, url: site + "#contact" }]] };
  }
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function answerTelegram(env, msg) {
  const chatId = msg.chat.id;
  const lang = tgLang(msg.from?.language_code);
  const raw = String(msg.text || "").trim();
  const cmd = raw.split(/[\s@]/)[0].toLowerCase();

  if (cmd === "/start") return tgSend(env, chatId, TG_TEXT[lang].start, lang, true);
  if (cmd === "/safety") return tgSend(env, chatId, TG_TEXT[lang].safety, lang, false);

  let question = COMMAND_QUESTIONS[cmd] || raw;
  if (!question) return; // stickers, photos etc.
  if (COMMAND_QUESTIONS[cmd] && lang !== "en") {
    question += lang === "uk" ? " Відповідай українською." : " Vastaa suomeksi.";
  }
  question = question.slice(0, MAX_MESSAGE);

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });
    const messages = [{ role: "user", content: question }];
    let answer = env.ANTHROPIC_API_KEY ? await askClaude(env, messages) : await askWorkersAI(env, messages);
    answer = String(answer || "").replace(/\*\*/g, "").trim();
    if (!answer) throw new Error("empty_answer");
    return tgSend(env, chatId, answer.slice(0, 4000), lang, false);
  } catch (err) {
    console.error("telegram_ai_error", err?.message || err);
    return tgSend(env, chatId, TG_TEXT[lang].busy, lang, true);
  }
}

async function handleTelegram(request, env, ctx) {
  if (request.method !== "POST") return new Response("ok");
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("ok");
  }
  const msg = update.message;
  if (msg && msg.chat?.type === "private") {
    if (typeof msg.text === "string") {
      ctx.waitUntil(answerTelegram(env, msg));
    } else if (msg.voice || msg.audio || msg.video_note || msg.photo || msg.video || msg.document) {
      // voice, photos and files: politely ask for text instead of staying silent
      const lang = tgLang(msg.from?.language_code);
      ctx.waitUntil(tgSend(env, msg.chat.id, TG_TEXT[lang].textOnly, lang, false));
    }
  }
  return new Response("ok"); // answer Telegram immediately; the reply is sent in the background
}

// One-time setup: open https://sydanukrainalle.org/api/telegram/setup?key=YOUR_WEBHOOK_SECRET
async function handleTelegramSetup(request, env) {
  const key = new URL(request.url).searchParams.get("key");
  if (!env.TELEGRAM_WEBHOOK_SECRET || key !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  const api = (method, body) =>
    fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const hook = await api("setWebhook", {
    url: new URL("/api/telegram", request.url).toString(),
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
  });
  const cmds = await api("setMyCommands", {
    commands: [
      { command: "start", description: "Start / Почати" },
      { command: "about", description: "About Global Mine Action Hub" },
      { command: "technology", description: "Dogs, drones and bees" },
      { command: "safety", description: "Found a suspicious object? / Знайшли предмет?" },
      { command: "partner", description: "Partnership and support" },
      { command: "contact", description: "Contact the team" },
    ],
  });
  const ok = hook.ok && cmds.ok;
  return new Response(ok ? "Telegram bot connected ✔" : "Setup failed: " + JSON.stringify({ hook, cmds }), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/* ---------- router ---------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/callback") return handleCallback(request, env);
    if (url.pathname === "/api/chat") return handleChat(request, env);
    if (url.pathname === "/api/notify") return handleNotify(request, env);
    if (url.pathname === "/api/join") return handleJoin(request, env);
    if (url.pathname === "/api/telegram") return handleTelegram(request, env, ctx);
    if (url.pathname === "/api/telegram/setup") return handleTelegramSetup(request, env);
    return env.ASSETS.fetch(request);
  },
};
