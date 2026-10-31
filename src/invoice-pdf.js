const C128 = "11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100,1100011101011".split(",");

/* Invoice PDF for the support form. No dependencies: built-in Helvetica (WinAnsi),
   EPC/SEPA QR and crypto QR from ./qrcode.js, Finnish bank barcode (CODE128C) drawn as bars. */

// Text → WinAnsi (Latin-1 + €). Cyrillic is transliterated, other symbols become "?".
const CYR = { а:"a",б:"b",в:"v",г:"h",ґ:"g",д:"d",е:"e",є:"ie",ж:"zh",з:"z",и:"y",і:"i",ї:"i",й:"i",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ь:"",ю:"iu",я:"ia",ё:"e",ы:"y",э:"e",ъ:"" };
function latin(str) {
  let out = "";
  for (const ch of String(str)) {
    const lo = ch.toLowerCase();
    if (CYR[lo] !== undefined) {
      const t = CYR[lo];
      out += ch !== lo && t ? t[0].toUpperCase() + t.slice(1) : t;
    } else if (ch === "€") out += "\x80";
    else if (ch === "–" || ch === "—") out += "\x96";
    else if (ch === "’" || ch === "‘") out += "'";
    else if (ch === "“" || ch === "”") out += '"';
    else if (ch === "•") out += "\x95";
    else if (ch.charCodeAt(0) < 256 && ch.length === 1) out += ch;
    else out += "?";
  }
  return out;
}
const pdfStr = (s) => "(" + latin(s).replace(/[\\()]/g, (c) => "\\" + c) + ")";

// Helvetica widths (per 1000) for printable ASCII, used to right-align and fit text
const HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HBW = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function textWidth(s, size, bold) {
  const w = bold ? HBW : HW;
  let t = 0;
  for (const ch of latin(s)) { const c = ch.charCodeAt(0); t += c >= 32 && c < 127 ? w[c - 32] : 556; }
  return (t * size) / 1000;
}

function code128c(digits) {
  const vals = [];
  for (let i = 0; i < digits.length; i += 2) vals.push(Number(digits.slice(i, i + 2)));
  let sum = 105;
  vals.forEach((v, i) => { sum += v * (i + 1); });
  return [105, ...vals, sum % 103, 106].map((v) => C128[v]).join("");
}

export function invoicePdf(inv, who, pay, qrcode) {
  const W = 595.28, H = 841.89, M = 50;
  const ops = [];
  const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
  const fill = (hex) => ops.push(`${rgb(hex)} rg`);
  const rect = (x, y, w, h, hex) => { fill(hex); ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const text = (x, y, s, size = 10, bold = false, hex = "#24302A", align = "left") => {
    let xx = x;
    if (align === "right") xx = x - textWidth(s, size, bold);
    if (align === "center") xx = x - textWidth(s, size, bold) / 2;
    fill(hex);
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td ${pdfStr(s)} Tj ET`);
  };
  const line = (x1, y1, x2, y2, hex = "#B9B29E", w = 0.7) => ops.push(`${rgb(hex)} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const qr = (data, x, yTop, size) => {
    const q = qrcode(0, "M"); q.addData(data); q.make();
    const n = q.getModuleCount(), cell = size / n;
    fill("#000000");
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
      if (q.isDark(r, c)) ops.push(`${(x + c * cell).toFixed(2)} ${(yTop - (r + 1) * cell).toFixed(2)} ${cell.toFixed(3)} ${cell.toFixed(3)} re f`);
  };
  const eur = (v) => "€" + Number(v).toFixed(2).replace(".", ",");
  const ORANGE = "#D4521C", GRAPH = "#27302A", MUTED = "#5A665E";

  // header band
  rect(0, H - 8, W, 8, ORANGE);
  text(M, H - 60, pay.payee, 18, true, GRAPH);
  text(M, H - 76, "Global Mine Action Hub", 10, true, ORANGE);
  text(M, H - 92, pay.address, 9, false, MUTED);
  text(M, H - 104, `Y-tunnus / Business ID ${pay.businessId}`, 9, false, MUTED);
  text(M, H - 116, `${pay.email} • sydanukrainalle.org`, 9, false, MUTED);

  text(W - M, H - 60, "INVOICE / LASKU", 18, true, GRAPH, "right");
  const meta = [
    ["Invoice no. / Laskun nro", inv.no],
    ["Date / Päivämäärä", inv.date],
    ["Due date / Eräpäivä", inv.due],
  ];
  if (inv.method === "bank") meta.push(["Reference / Viitenumero", inv.ref]);
  meta.forEach(([k, v], i) => {
    const y = H - 82 - i * 14;
    text(W - M - 120, y, k, 8.5, false, MUTED, "right");
    text(W - M, y, v, 9.5, true, GRAPH, "right");
  });

  // bill to
  let y = H - 160;
  line(M, y + 14, W - M, y + 14);
  text(M, y - 4, "SPONSOR / MAKSAJA", 8, true, ORANGE);
  text(M, y - 20, who.name, 11, true);
  text(M, y - 34, who.email, 9.5, false, MUTED);

  // item table
  y -= 70;
  rect(M, y - 6, W - 2 * M, 22, GRAPH);
  text(M + 10, y + 1, "Item / Kohde", 9.5, true, "#FFFFFF");
  text(W - M - 10, y + 1, "Amount / Summa", 9.5, true, "#FFFFFF", "right");
  y -= 26;
  text(M + 10, y, inv.itemEn, 10.5, true);
  text(M + 10, y - 13, inv.itemFi, 9, false, MUTED);
  text(W - M - 10, y, eur(inv.eur), 10.5, true, GRAPH, "right");
  y -= 26;
  line(M, y, W - M, y);
  y -= 18;
  text(W - M - 110, y, "Total / Yhteensä", 10, true, GRAPH, "right");
  text(W - M - 10, y, eur(inv.eur), 13, true, ORANGE, "right");
  y -= 16;
  text(M, y, "No VAT: the association is not VAT-registered. / Ei arvonlisäveroa: yhdistys ei ole alv-rekisterissä.", 8.5, false, MUTED);

  // payment
  y -= 34;
  text(M, y, "PAYMENT / MAKSUTIEDOT", 8, true, ORANGE);
  y -= 18;
  if (inv.method === "bank") {
    const rows = [
      ["Payee / Saaja", pay.payee],
      ["IBAN", pay.iban],
      ["BIC", `${pay.bic} (${pay.bank})`],
      ["Reference / Viite", inv.ref],
      ["Amount / Summa", eur(inv.eur)],
      ["Due date / Eräpäivä", inv.due],
    ];
    rows.forEach(([k, v], i) => {
      text(M, y - i * 16, k, 9, false, MUTED);
      text(M + 120, y - i * 16, v, 10.5, true);
    });
    text(M, y - rows.length * 16 - 6, "Please enter the reference number with your payment. / Käytäthän maksaessa viitenumeroa.", 8.5, false, MUTED);

    const iban = pay.iban.replace(/\s/g, "");
    const epc = ["BCD", "002", "1", "SCT", pay.bic, pay.payee, iban, "EUR" + Number(inv.eur).toFixed(2), "", "", `Viite ${inv.ref} ${inv.no}`, ""].join("\n");
    qr(epc, W - M - 120, y + 8, 120);
    text(W - M - 60, y - 124, "SEPA QR (EU banking apps)", 7.5, false, MUTED, "center");

    // Finnish virtual barcode v4 + CODE128C
    const d = inv.due.split(".");
    const ref20 = ("0".repeat(20) + inv.ref).slice(-20);
    const vb = "4" + iban.slice(2) + ("000000" + Math.floor(inv.eur)).slice(-6) + ("0" + Math.round((inv.eur % 1) * 100)).slice(-2) + "000" + ref20 + d[2].slice(2) + d[1] + d[0];
    const bars = code128c(vb);
    const by = y - 200, mod = 0.9, bx = M;
    text(M, by + 62, "Bank barcode / Pankkiviivakoodi", 8, true, ORANGE);
    fill("#000000");
    for (let i = 0; i < bars.length;) {
      if (bars[i] === "1") {
        let j = i; while (bars[j] === "1") j++;
        ops.push(`${(bx + i * mod).toFixed(2)} ${by} ${((j - i) * mod).toFixed(2)} 50 re f`);
        i = j;
      } else i++;
    }
    text(M, by - 14, vb, 8.5, false, GRAPH);
  } else {
    const addr = inv.method === "btc" ? pay.btc : pay.evm;
    text(M, y, inv.method === "btc" ? "Bitcoin (BTC)" : "USDT / USDC / ETH / BNB", 10.5, true);
    text(M, y - 18, "Send to this address / Lähetä tähän osoitteeseen:", 9, false, MUTED);
    text(M, y - 34, addr, 9.5, true);
    const net = inv.method === "btc"
      ? ["Bitcoin network only. Send the equivalent of the amount in BTC.", "Vain Bitcoin-verkko. Lähetä summaa vastaava määrä BTC:nä."]
      : ["Networks: BNB Smart Chain, Ethereum, Polygon, Arbitrum, Base.", "Send the equivalent of the amount in USDT, USDC, ETH or BNB."];
    text(M, y - 54, net[0], 8.5, false, MUTED);
    text(M, y - 66, net[1], 8.5, false, MUTED);
    text(M, y - 86, `After paying, please email the transaction link to ${pay.email}`, 8.5, false, MUTED);
    text(M, y - 98, `with invoice no. ${inv.no}.`, 8.5, false, MUTED);
    qr(inv.method === "btc" ? "bitcoin:" + addr : addr, W - M - 120, y + 8, 120);
  }

  // footer
  line(M, 70, W - M, 70);
  text(M, 54, "Thank you for supporting humanitarian demining in Ukraine. / Kiitos, että tuet humanitaarista miinanraivausta Ukrainassa.", 8.5, false, MUTED);
  text(M, 42, `${pay.payee} • ${pay.address} • Y-tunnus ${pay.businessId} • ${pay.email}`, 7.5, false, MUTED);
  rect(0, 0, W, 6, GRAPH);

  // assemble PDF (all strings are single-byte)
  const content = ops.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfStr(`Invoice ${inv.no}`)} /Author ${pdfStr(pay.payee)} >>`,
  ];
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf; // binary string (1 char = 1 byte)
}

export const pdfBase64 = (bin) => btoa(bin);
