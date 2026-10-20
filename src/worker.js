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

/* ---------- router ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/callback") return handleCallback(request, env);
    if (url.pathname === "/api/chat") return handleChat(request, env);
    return env.ASSETS.fetch(request);
  },
};
