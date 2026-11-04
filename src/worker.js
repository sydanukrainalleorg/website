// Global Mine Action Hub — website worker.
// Serves the site from /public, sends callback requests to Telegram
// and answers visitor questions in the site chat.
//
// Secrets (Cloudflare → website → Settings → Variables and Secrets):
//   TELEGRAM_BOT_TOKEN — token from @BotFather
//   TELEGRAM_CHAT_ID   — chat that receives callback requests
//   ANTHROPIC_API_KEY  — optional. If set, the chat uses Claude; otherwise Cloudflare Workers AI (free tier).

import { SYSTEM_PROMPT } from "./knowledge.js";
import qrcode from "./qrcode.js";
import { invoicePdf } from "./invoice-pdf.js";

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

/* ---------- handler talent pool (/dog-handler/, /uk/kinolog/, /fi/koiranohjaaja/) → Telegram ---------- */

const RESERVE = {
  country: { FI: "Финляндия", EU: "другая страна ЕС", UA: "Украина", OT: "другая страна" },
  dog: { none: "нет, хочет научиться", own: "есть своя собака", sport: "дрессировка / кинологический спорт", service: "служебная кинология (армия, полиция, ГСЧС)", pro: "профессиональный кинолог / инструктор" },
  english: { "0": "не владеет", A: "начальный (A1–A2)", B: "средний (B1–B2)", C: "свободный (C1–C2)" },
  ret: { "6m": "в течение полугода", "1y": "в течение года", later: "позже", ns: "ещё не решил(а)", ua: "уже в Украине" },
};

async function handleReserve(request, env) {
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

  const pick = (map, key) => map[clean(key, 10)] || "—";
  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const text =
    `🎯 Кадровый резерв кинологов — sydanukrainalle.org\n\n` +
    `Имя: ${name}\n` +
    `Email: ${email}\n` +
    `Телефон / WhatsApp / Telegram: ${clean(data.phone, 60) || "—"}\n` +
    `Где живёт: ${pick(RESERVE.country, data.country)}${clean(data.city, 80) ? `, ${clean(data.city, 80)}` : ""}\n` +
    `Опыт с собаками: ${pick(RESERVE.dog, data.dog)}\n` +
    `Английский: ${pick(RESERVE.english, data.english)}\n` +
    `Возвращение в Украину: ${pick(RESERVE.ret, data.ret)}\n` +
    `О себе: ${String(data.message ?? "").trim().slice(0, 600) || "—"}\n` +
    `Язык страницы: ${LANGS[clean(data.lang, 5)] || "—"}\n` +
    `Страна посетителя: ${request.cf?.country || "—"}\n` +
    `Время (Хельсинки): ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" })}\n\n` +
    `Нужно: внести в таблицу резерва, отправить приветственное письмо, пригласить на ближайшую встречу.`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true });
}

/* ---------- donation interest list → Telegram ---------- */

/* ---------- support form → invoice + Telegram (+ email if RESEND_API_KEY is set) ---------- */

const NEEDS = {
  puppy:    { ru: "Щенок малинуа", en: "Malinois puppy", uk: "Цуценя малінуа", fi: "Malinois-pentu", eur: 1800 },
  scent:    { ru: "Набор образцов запахов", en: "Scent training kit", uk: "Набір для навчання на запах", fi: "Hajukoulutussarja", eur: 650 },
  food:     { ru: "Корм для собаки, 6 мес.", en: "Food for one dog, 6 months", uk: "Корм для однієї собаки, 6 міс.", fi: "Yhden koiran ruoka, 6 kk", eur: 420 },
  vet:      { ru: "Ветеринария для собаки, 6 мес.", en: "Vet care for one dog, 6 months", uk: "Ветеринарний догляд, 6 міс.", fi: "Eläinlääkärikulut, 6 kk", eur: 400 },
  equip:    { ru: "Снаряжение для собаки", en: "Equipment for one dog", uk: "Спорядження для однієї собаки", fi: "Yhden koiran varusteet", eur: 300 },
  uniform:  { ru: "Форма кинолога", en: "Handler uniform", uk: "Форма для кінолога", fi: "Ohjaajan työasu", eur: 400 },
  training: { ru: "Обучение кинолога", en: "Handler training and certification", uk: "Навчання та сертифікація кінолога", fi: "Ohjaajan koulutus ja sertifiointi", eur: 3000 },
  sim:      { ru: "Тренажёр первой помощи K9", en: "K9 first-aid training simulator", uk: "Тренажер першої допомоги собакам", fi: "Koiran ensiavun koulutussimulaattori", eur: null },
  partner:  { ru: "Партнёрство компании", en: "Company partnership", uk: "Партнерство компанії", fi: "Yrityskumppanuus", eur: null },
  inkind:   { ru: "Помощь продукцией или услугами", en: "Products or services", uk: "Продукція або послуги", fi: "Tuotteet tai palvelut", eur: null },
};
const METHODS = { bank: "Банковский перевод", btc: "Bitcoin", evm: "USDT / USDC / ETH / BNB" };
const PAY = {
  payee: "Sydän Ukrainalle ry", businessId: "3543515-1",
  address: "Längelmäentie 10 B 7, 35400 Längelmäki, Finland", email: "info@sydanukrainalle.org",
  iban: "FI24 7997 7995 0475 81", bic: "HOLVFIHH", bank: "Holvi",
  btc: "bc1q8646rjay90nd4sfejt5qavmc6td9sawyqau8lm",
  evm: "0x7814916cc6A4FeA5AB130f4400D9C5cD02940A15",
};

// Finnish reference number (viitenumero): base digits + check digit with weights 7-3-1
function finnishRef(base) {
  const w = [7, 3, 1];
  let sum = 0;
  base.split("").reverse().forEach((d, i) => { sum += Number(d) * w[i % 3]; });
  return base + String((10 - (sum % 10)) % 10);
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const MAIL_T = {
  en: { subj: "Invoice", hi: "Thank you for supporting Global Mine Action Hub!", item: "Item", amount: "Amount", due: "Due date", ref: "Reference", vat: "No VAT: the association is not VAT-registered.", addr: "Send to this address", evmNet: "Networks: BNB Smart Chain, Ethereum, Polygon, Arbitrum, Base. Send the equivalent of the amount in USDT, USDC, ETH or BNB.", btcNet: "Bitcoin network only. Send the equivalent of the amount in BTC.", after: "After a crypto payment, please reply to this email with the transaction link.", pdf: "The invoice is attached as a PDF." },
  uk: { subj: "Рахунок", hi: "Дякуємо за підтримку Global Mine Action Hub!", item: "Призначення", amount: "Сума", due: "Сплатити до", ref: "Референс", vat: "Без ПДВ: асоціація не є платником ПДВ.", addr: "Надішліть на цю адресу", evmNet: "Мережі: BNB Smart Chain, Ethereum, Polygon, Arbitrum, Base. Надішліть еквівалент суми в USDT, USDC, ETH або BNB.", btcNet: "Лише мережа Bitcoin. Надішліть еквівалент суми в BTC.", after: "Після криптоплатежу дайте відповідь на цей лист із посиланням на транзакцію.", pdf: "Рахунок у форматі PDF додано до листа." },
  fi: { subj: "Lasku", hi: "Kiitos, että tuet Global Mine Action Hubia!", item: "Kohde", amount: "Summa", due: "Eräpäivä", ref: "Viitenumero", vat: "Ei arvonlisäveroa: yhdistys ei ole alv-rekisterissä.", addr: "Lähetä tähän osoitteeseen", evmNet: "Verkot: BNB Smart Chain, Ethereum, Polygon, Arbitrum, Base. Lähetä summaa vastaava määrä USDT:nä, USDC:nä, ETH:na tai BNB:nä.", btcNet: "Vain Bitcoin-verkko. Lähetä summaa vastaava määrä BTC:nä.", after: "Vastaa kryptomaksun jälkeen tähän viestiin ja liitä tapahtuman linkki.", pdf: "Lasku on liitteenä PDF-tiedostona." },
};

async function emailInvoice(env, to, name, lang, inv, need) {
  if (!env.RESEND_API_KEY) return false;
  let attachments;
  try {
    const pdf = invoicePdf({ ...inv, itemEn: need.en, itemFi: need.fi }, { name, email: to }, PAY, qrcode);
    attachments = [{ filename: `${inv.no}.pdf`, content: btoa(pdf) }];
  } catch (e) {
    console.log("invoice pdf failed", e);
  }
  const t = MAIL_T[lang] || MAIL_T.en;
  const pay = inv.method === "bank"
    ? `IBAN: <b>${PAY.iban}</b><br>BIC: ${PAY.bic} (${PAY.bank})<br>${t.ref}: <b>${inv.ref}</b>`
    : `${t.addr}:<br><b style="font-family:monospace">${inv.method === "btc" ? PAY.btc : PAY.evm}</b><br>${inv.method === "btc" ? t.btcNet : t.evmNet}<br>${t.after}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#24302A">
<p>${t.hi}</p>
${attachments ? `<p>${t.pdf}</p>` : ""}
<h2 style="margin:0 0 8px">${t.subj} ${inv.no}</h2>
<p>${esc(name)}<br>${esc(to)}</p>
<p>${t.item}: <b>${inv.item}</b><br>${t.amount}: <b>€${inv.eur}</b><br>${t.due}: ${inv.due}</p>
<p>${PAY.payee} (Y-tunnus ${PAY.businessId})<br>${pay}</p>
<p style="color:#666;font-size:13px">${t.vat}<br>${PAY.payee}, ${PAY.address}, ${PAY.email}</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `Sydän Ukrainalle ry <${PAY.email}>`, to: [to], bcc: [PAY.email], reply_to: PAY.email, subject: `${t.subj} ${inv.no} — Global Mine Action Hub`, html, attachments }),
  });
  return r.ok;
}

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
  const phone = clean(data.phone, 40) || "—";
  const lang = ["en", "uk", "fi"].includes(clean(data.lang, 5)) ? clean(data.lang, 5) : "en";
  const need = NEEDS[clean(data.type, 20)];
  const method = METHODS[clean(data.method, 10)] ? clean(data.method, 10) : "bank";
  if (!need || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data.consent !== true) {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({ ok: false, error: "not_configured" }, 500);

  const now = new Date();
  const hel = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${String(hel.getFullYear()).slice(2)}${pad(hel.getMonth() + 1)}${pad(hel.getDate())}`;
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  let inv = null;
  if (need.eur) {
    const dueD = new Date(hel.getTime() + 14 * 86400000);
    inv = {
      no: `GMAH-${stamp}-${rnd}`,
      ref: finnishRef(`${stamp}${pad(hel.getHours())}${pad(hel.getMinutes())}${rnd}`),
      date: `${pad(hel.getDate())}.${pad(hel.getMonth() + 1)}.${hel.getFullYear()}`,
      due: `${pad(dueD.getDate())}.${pad(dueD.getMonth() + 1)}.${dueD.getFullYear()}`,
      eur: need.eur, item: need[lang] || need.en, method,
    };
  }

  let mailed = false;
  if (inv) {
    try { mailed = await emailInvoice(env, email, name, lang, inv, need); } catch { mailed = false; }
  }

  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const time = now.toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" });
  const text =
    `💛 Хочет поддержать проект — sydanukrainalle.org\n\n` +
    `Вариант: ${need.ru}${need.eur ? ` (€${need.eur})` : ""}\n` +
    (inv ? `Счёт: ${inv.no}, оплата до ${inv.due}\nСпособ оплаты: ${METHODS[method]}\nРеференс: ${inv.ref}\nСчёт на почту: ${mailed ? "отправлен" : "не отправлен (почтовый сервис не подключён)"}\n` : `Без счёта: нужно связаться лично\n`) +
    `\nEmail: ${email}\nИмя: ${name}\nТелефон / WhatsApp: ${phone}\n` +
    `Язык сайта: ${LANGS[lang]}\n` +
    `Страна посетителя: ${request.cf?.country || "—"}\n` +
    `Время (Хельсинки): ${time}`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true, invoice: inv, mailed, pay: inv ? PAY : null });
}

/* ---------- supporting membership → reference number + Telegram (+ email) ---------- */

const TIERS = {
  basic:     { ru: "Поддерживающий член", en: "Supporting member", uk: "Підтримуючий член", fi: "Kannatusjäsen", eur: 5 },
  supporter: { ru: "Сторонник", en: "Supporter", uk: "Прихильник", fi: "Tukija", eur: 10 },
  godparent: { ru: "Крёстный собаки", en: "Dog’s godparent", uk: "Хрещений собаки", fi: "Koiran kummi", eur: 25 },
  company:   { ru: "Компания-член", en: "Company member", uk: "Компанія-член", fi: "Yrityskannatusjäsen", eur: 50 },
};

const MEMBER_MAIL = {
  en: { subj: "Your supporting membership", hi: "Thank you for becoming a supporting member of Sydän Ukrainalle ry!", level: "Level", fee: "Fee", m: "per month", y: "per year", ref: "Your personal reference number", how: "In your bank app, set up a recurring payment (standing order) with these details: every month or every year, as you chose. Always use your reference number.", crypto: "Send the fee every month or every year, as you chose, and reply to this email with the transaction link.", board: "The board confirms new members, and we will send you a welcome email. You can leave at any time by replying to this email. Supporting members do not vote and do not take part in running the association.", vat: "No VAT: the association is not VAT-registered." },
  uk: { subj: "Ваше підтримуюче членство", hi: "Дякуємо, що стали підтримуючим членом Sydän Ukrainalle ry!", level: "Рівень", fee: "Внесок", m: "на місяць", y: "на рік", ref: "Ваш персональний референс", how: "У застосунку свого банку налаштуйте регулярний платіж із цими реквізитами: щомісяця або раз на рік, як ви обрали. Завжди вказуйте свій референс.", crypto: "Надсилайте внесок щомісяця або раз на рік, як ви обрали, і дайте відповідь на цей лист із посиланням на транзакцію.", board: "Правління підтверджує нових членів, і ми надішлемо вам вітального листа. Вийти можна будь-коли: просто дайте відповідь на цей лист. Підтримуючі члени не голосують і не беруть участі в управлінні асоціацією.", vat: "Без ПДВ: асоціація не є платником ПДВ." },
  fi: { subj: "Kannatusjäsenyytesi", hi: "Kiitos, että liityit Sydän Ukrainalle ry:n kannatusjäseneksi!", level: "Taso", fee: "Maksu", m: "kuukaudessa", y: "vuodessa", ref: "Henkilökohtainen viitenumerosi", how: "Tee pankkisovelluksessasi toistuva maksu näillä tiedoilla: kuukausittain tai vuosittain valintasi mukaan. Käytä aina viitenumeroasi.", crypto: "Lähetä maksu kuukausittain tai vuosittain valintasi mukaan ja vastaa tähän viestiin tapahtuman linkillä.", board: "Hallitus hyväksyy uudet jäsenet, ja lähetämme sinulle tervetuloviestin. Voit erota milloin tahansa vastaamalla tähän viestiin. Kannatusjäsenellä ei ole äänioikeutta, eikä hän osallistu yhdistyksen hallintoon.", vat: "Ei arvonlisäveroa: yhdistys ei ole alv-rekisterissä." },
};

async function emailMember(env, to, name, lang, m) {
  if (!env.RESEND_API_KEY) return false;
  const t = MEMBER_MAIL[lang] || MEMBER_MAIL.en;
  const money = lang === "fi" ? `${m.amount} €` : `€${m.amount}`;
  const pay = m.method === "bank"
    ? `${t.ref}: <b style="font-size:18px">${m.ref}</b><br>IBAN: <b>${PAY.iban}</b><br>BIC: ${PAY.bic} (${PAY.bank})<br>${PAY.payee}</p><p>${t.how}`
    : `<b style="font-family:monospace">${m.method === "btc" ? PAY.btc : PAY.evm}</b></p><p>${t.crypto}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#24302A">
<p>${t.hi}</p>
<h2 style="margin:0 0 8px">${m.no}</h2>
<p>${esc(name)}<br>${esc(to)}</p>
<p>${t.level}: <b>${m.label}</b><br>${t.fee}: <b>${money} ${m.period === "y" ? t.y : t.m}</b></p>
<p>${pay}</p>
<p>${t.board}</p>
<p style="color:#666;font-size:13px">${t.vat}<br>${PAY.payee} (Y-tunnus ${PAY.businessId}), ${PAY.address}, ${PAY.email}</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: `Sydän Ukrainalle ry <${PAY.email}>`, to: [to], bcc: [PAY.email], reply_to: PAY.email, subject: `${t.subj} ${m.no} — Global Mine Action Hub`, html }),
  });
  return r.ok;
}

async function handleMember(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  if (clean(data.website, 200)) return json({ ok: true }); // spam trap

  const email = clean(data.email, 120);
  const name = clean(data.name, 100);
  const phone = clean(data.phone, 40) || "—";
  const lang = ["en", "uk", "fi"].includes(clean(data.lang, 5)) ? clean(data.lang, 5) : "en";
  const tier = TIERS[clean(data.tier, 20)];
  const period = clean(data.period, 2) === "y" ? "y" : "m";
  const method = METHODS[clean(data.method, 10)] ? clean(data.method, 10) : "bank";
  if (!tier || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || data.consent !== true) {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({ ok: false, error: "not_configured" }, 500);

  const now = new Date();
  const hel = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${String(hel.getFullYear()).slice(2)}${pad(hel.getMonth() + 1)}${pad(hel.getDate())}`;
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  // permanent personal reference: starts with 9 so it never matches a sponsor invoice reference
  const m = {
    no: `GMAH-M-${stamp}-${rnd}`,
    ref: finnishRef(`9${stamp}${rnd}`),
    tier: clean(data.tier, 20), label: tier[lang] || tier.en,
    eur: tier.eur, period, amount: period === "y" ? tier.eur * 12 : tier.eur, method,
  };

  let mailed = false;
  try { mailed = await emailMember(env, email, name, lang, m); } catch { mailed = false; }

  const LANGS = { en: "английский", uk: "украинский", fi: "финский" };
  const text =
    `🤝 Заявка на поддерживающее членство — sydanukrainalle.org\n\n` +
    `Уровень: ${tier.ru} (€${tier.eur}/мес)\n` +
    `Оплата: ${period === "y" ? `раз в год, €${m.amount}` : `ежемесячно, €${m.amount}`}, ${METHODS[method]}\n` +
    `Заявка: ${m.no}\nПерсональный референс: ${m.ref}\n` +
    `Письмо с реквизитами: ${mailed ? "отправлено" : "не отправлено"}\n` +
    `\nИмя / компания: ${name}\nEmail: ${email}\nТелефон / WhatsApp: ${phone}\n` +
    `Язык сайта: ${LANGS[lang]}\n` +
    `Страна посетителя: ${request.cf?.country || "—"}\n` +
    `Время (Хельсинки): ${now.toLocaleString("ru-RU", { timeZone: "Europe/Helsinki" })}\n\n` +
    `Нужно: утвердить в правлении, внести в реестр членов, отправить приветственное письмо.`;

  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!tg.ok) return json({ ok: false, error: "send_failed" }, 502);
  return json({ ok: true, member: m, mailed, pay: PAY });
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
    if (url.pathname === "/api/member") return handleMember(request, env);
    if (url.pathname === "/api/reserve") return handleReserve(request, env);
    if (url.pathname === "/api/telegram") return handleTelegram(request, env, ctx);
    if (url.pathname === "/api/telegram/setup") return handleTelegramSetup(request, env);
    return env.ASSETS.fetch(request);
  },
};
