// Global Mine Action Hub — website worker.
// Serves the site from /public and handles callback requests from the contact form.
// Secrets (set in Cloudflare → website → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — token from @BotFather
//   TELEGRAM_CHAT_ID   — chat that receives the requests

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

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

  const time = new Date().toLocaleString("fi-FI", { timeZone: "Europe/Helsinki" });
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/callback") return handleCallback(request, env);
    return env.ASSETS.fetch(request);
  },
};
