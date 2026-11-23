#!/usr/bin/env python3
"""Build the News section of sydanukrainalle.org from news/*.json.

Usage (from the repository root):
    python3 tools/build_news.py

One JSON file per news item lives in news/ (see any existing file for the format).
The script regenerates:
  public/news/…, public/fi/uutiset/…, public/uk/novyny/…   (list pages + one page per item + RSS)
  the news block in public/sitemap.xml                  (between <!-- news:start --> and <!-- news:end -->)
  the "Latest news" block on the three home pages        (between <!-- news-block:start --> and <!-- news-block:end -->)
Commit the result and push to main: Cloudflare publishes it automatically.
"""
import html
import json
import re
import shutil
from datetime import date, datetime, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
SITE = "https://sydanukrainalle.org"
LANGS = ["en", "fi", "uk"]
BASE = {"en": "/news/", "fi": "/fi/uutiset/", "uk": "/uk/novyny/"}
HOME = {"en": "/", "fi": "/fi/", "uk": "/uk/"}
TEMPLATE_PAGE = {"en": "dog-handler/index.html", "fi": "fi/koiranohjaaja/index.html", "uk": "uk/kinolog/index.html"}
LOCALE = {"en": "en_GB", "fi": "fi_FI", "uk": "uk_UA"}
MONTHS = {
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    "fi": ["tammikuuta", "helmikuuta", "maaliskuuta", "huhtikuuta", "toukokuuta", "kesäkuuta", "heinäkuuta", "elokuuta", "syyskuuta", "lokakuuta", "marraskuuta", "joulukuuta"],
    "uk": ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
}
T = {
    "en": {
        "list_title": "Mine action news", "kicker": "News",
        "list_desc": "News about humanitarian demining in Ukraine and around the world: short summaries of key events with a link to the original source, and updates from Global Mine Action Hub.",
        "industry": "Industry news", "gmah": "GMAH news", "sources": "Sources", "source": "Source",
        "all": "← All news", "home": "← Home", "read": "Read more →", "latest": "Latest news", "all_link": "All news →",
        "photo": "Illustrative photo", "cta_t": "Want to be part of it?",
        "cta": "Ukraine needs thousands of mine detection dog teams. Join our talent pool of future handlers or support the programme.",
        "cta1": ("Become a dog handler", "/dog-handler/"), "cta2": ("Support GMAH", "/#support"),
        "rss": "News feed (RSS)",
        "bc_home": "Home", "bc_news": "News", "related": "More news", "updated": "Updated",
    },
    "fi": {
        "list_title": "Miinatoiminnan uutiset", "kicker": "Uutiset",
        "list_desc": "Uutisia humanitaarisesta miinanraivauksesta Ukrainassa ja maailmalla: lyhyet tiivistelmät tärkeimmistä tapahtumista linkkeineen alkuperäisiin lähteisiin sekä Global Mine Action Hubin omat kuulumiset.",
        "industry": "Alan uutiset", "gmah": "GMAH:n uutiset", "sources": "Lähteet", "source": "Lähde",
        "all": "← Kaikki uutiset", "home": "← Etusivu", "read": "Lue lisää →", "latest": "Tuoreimmat uutiset", "all_link": "Kaikki uutiset →",
        "photo": "Kuvituskuva", "cta_t": "Haluatko mukaan?",
        "cta": "Ukraina tarvitsee tuhansia miinakoiraryhmiä. Liity tulevien koiranohjaajien reserviin tai tue ohjelmaa.",
        "cta1": ("Ryhdy koiranohjaajaksi", "/fi/koiranohjaaja/"), "cta2": ("Tue GMAH:ta", "/fi/#support"),
        "rss": "Uutissyöte (RSS)",
        "bc_home": "Etusivu", "bc_news": "Uutiset", "related": "Lisää uutisia", "updated": "Päivitetty",
    },
    "uk": {
        "list_title": "Новини протимінної діяльності", "kicker": "Новини",
        "list_desc": "Новини гуманітарного розмінування в Україні та світі: короткий виклад найважливіших подій з посиланням на першоджерело, а також новини Global Mine Action Hub.",
        "industry": "Новини галузі", "gmah": "Новини GMAH", "sources": "Джерела", "source": "Джерело",
        "all": "← Усі новини", "home": "← Головна", "read": "Читати далі →", "latest": "Останні новини", "all_link": "Усі новини →",
        "photo": "Ілюстративне фото", "cta_t": "Хочете долучитися?",
        "cta": "Україні потрібні тисячі команд із собаками-шукачами мін. Долучайтеся до кадрового резерву майбутніх кінологів або підтримайте програму.",
        "cta1": ("Стати кінологом", "/uk/kinolog/"), "cta2": ("Підтримати GMAH", "/uk/#support"),
        "rss": "Стрічка новин (RSS)",
        "bc_home": "Головна", "bc_news": "Новини", "related": "Інші новини", "updated": "Оновлено",
    },
}

E = html.escape
ORG_ID = f"{SITE}/#organization"
ORG_REF = {"@type": "NGO", "@id": ORG_ID, "name": "Global Mine Action Hub (Sydän Ukrainalle ry)", "url": f"{SITE}/",
           "logo": {"@type": "ImageObject", "url": f"{SITE}/apple-touch-icon.png"}}
TITLE_MAX, DESC_MIN, DESC_MAX = 65, 70, 160


def fmt_date(d, lang):
    if lang == "en":
        return f"{d.day} {MONTHS['en'][d.month - 1]} {d.year}"
    if lang == "fi":
        return f"{d.day}. {MONTHS['fi'][d.month - 1]} {d.year}"
    return f"{d.day} {MONTHS['uk'][d.month - 1]} {d.year} р."


def load_items():
    items = []
    for f in sorted((ROOT / "news").glob("*.json")):
        it = json.loads(f.read_text(encoding="utf-8"))
        it["_date"] = date.fromisoformat(it["date"])
        for lang in LANGS:
            if lang not in it:
                raise SystemExit(f"{f.name}: missing language '{lang}'")
            for k in ("title", "summary", "body"):
                if not it[lang].get(k):
                    raise SystemExit(f"{f.name}: '{lang}.{k}' is empty")
        for lang in LANGS:
            x = it[lang]
            st = x.get("seo_title") or x["title"]
            d = x.get("description") or x["summary"]
            if len(st) > TITLE_MAX:
                print(f"WARNING {f.name} [{lang}]: title for search is {len(st)} chars (max {TITLE_MAX}) - add a shorter 'seo_title'")
            if not DESC_MIN <= len(d) <= DESC_MAX:
                print(f"WARNING {f.name} [{lang}]: description is {len(d)} chars (aim {DESC_MIN}-{DESC_MAX}) - add/adjust 'description'")
        if it.get("updated"):
            it["_updated"] = date.fromisoformat(it["updated"])
        if not re.fullmatch(r"[a-z0-9-]+", it["slug"]):
            raise SystemExit(f"{f.name}: slug must be lowercase latin letters, digits and dashes")
        items.append(it)
    items.sort(key=lambda x: (x["_date"], x["slug"]), reverse=True)
    slugs = [i["slug"] for i in items]
    if len(slugs) != len(set(slugs)):
        raise SystemExit("duplicate slug in news/")
    return items


# ---------- pieces taken from the existing pages so the look stays identical ----------
def template_parts(lang):
    src = (PUB / TEMPLATE_PAGE[lang]).read_text(encoding="utf-8")
    style = src.split("<style>", 1)[1].split("/* hero */", 1)[0]
    brand = re.search(r'<a class="brand".*?</a>', src, re.S).group(0)
    footer_p = re.search(r"<footer>\s*<div class=\"wrap\">\s*(<p>.*?</p>)", src, re.S).group(1)
    return style, brand, footer_p


def privacy_href(lang):
    return {"en": "/privacy/", "fi": "/fi/privacy/", "uk": "/uk/privacy/"}[lang]


NEWS_CSS = """
.hero{padding:56px 0 40px;border-top:0}
.kicker{display:inline-block;font-size:.85rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--orange);margin-bottom:14px}
.backhome{font-size:.95rem}
.news-list{display:grid;gap:20px;padding:0 0 88px;margin:0;list-style:none}
.news-card{display:grid;grid-template-columns:220px 1fr;gap:24px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;align-items:start}
.news-card.noimg{grid-template-columns:1fr}
.news-card img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block}
.news-card h2{font-size:1.45rem;margin:.2em 0 .4em}
.news-card h2 a{color:var(--ink);text-decoration:none}
.news-card h2 a:hover{color:var(--orange)}
.news-card p{margin:0 0 .6em}
.meta{font-size:.85rem;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap}
.tag{color:var(--orange);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
@media (max-width:700px){.news-card{grid-template-columns:1fr}}
article.news{padding:0 0 64px}
article.news h1{font-size:clamp(2rem,4.4vw,3.1rem);max-width:24ch}
article.news .lead{font-size:1.15rem;color:var(--muted);max-width:62ch}
article.news figure{margin:28px 0;max-width:760px}
article.news figure img{width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:10px;display:block}
article.news figcaption{font-size:.8rem;color:var(--muted);margin-top:6px}
article.news .why{border-left:4px solid var(--orange);background:var(--surface);padding:16px 20px;border-radius:0 8px 8px 0;max-width:62ch;margin:24px 0}
article.news .sources{font-size:.92rem;color:var(--muted)}
article.news .sources ul{padding-left:1.2em;margin:.4em 0}
.cta{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:28px;margin:8px 0 88px;max-width:760px}
.cta h2{font-size:1.6rem}
.cta .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
footer{border-top:1px solid var(--line);padding:32px 0 48px;color:var(--muted);font-size:.9rem}
.crumbs{font-size:.9rem;color:var(--muted);margin-bottom:22px}
.crumbs span{color:var(--muted)}
.related{padding:0 0 40px}
.related h2{font-size:1.6rem;margin-bottom:16px}
.related .news-list{padding-bottom:40px}
.related .news-card h3{font-size:1.2rem;margin:.2em 0 .4em}
.related .news-card h3 a{color:var(--ink);text-decoration:none}
"""


def lang_switch(lang, paths):
    labels = {"en": "EN", "uk": "УКР", "fi": "FI"}
    aria = {"en": "Language", "fi": "Kieli", "uk": "Мова"}[lang]
    out = []
    for l in ("en", "uk", "fi"):
        cur = ' aria-current="true"' if l == lang else ""
        out.append(f'<a href="{paths[l]}" hreflang="{l}" lang="{l}"{cur}>{labels[l]}</a>')
    return f'<nav class="langs" aria-label="{aria}" style="margin-left:auto">{"".join(out)}</nav>'


def page(lang, *, title, desc, url_path, alt_paths, body, og_type="website", jsonld=None, og_image=None, extra_head=""):
    style, brand, footer_p = template_parts(lang)
    t = T[lang]
    alts = "\n".join(f'<link rel="alternate" hreflang="{l}" href="{SITE}{alt_paths[l]}">' for l in LANGS)
    img = og_image or f"{SITE}/og-image.png"
    lds = jsonld if isinstance(jsonld, list) else ([jsonld] if jsonld else [])
    ld = "".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>\n' for j in lds)
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(title)} | GMAH</title>
<meta name="description" content="{E(desc)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#35503A">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Global Mine Action Hub">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{SITE}{url_path}">
<meta property="og:image" content="{img}">
<meta property="og:locale" content="{LOCALE[lang]}">
<meta name="twitter:card" content="summary_large_image">
{extra_head}<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="{SITE}{url_path}">
{alts}
<link rel="alternate" hreflang="x-default" href="{SITE}{alt_paths['en']}">
<link rel="alternate" type="application/rss+xml" title="{E(t['rss'])}" href="{SITE}{BASE[lang]}feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
{ld}<style>{style}{NEWS_CSS}</style>
<script src="/js/consent.js"></script>
</head>
<body>
<header class="top">
  <div class="wrap">
    {brand}
    {lang_switch(lang, alt_paths)}
  </div>
</header>
<main>
{body}
</main>
<footer>
  <div class="wrap">
    {footer_p}
    <p><a href="mailto:info@sydanukrainalle.org">info@sydanukrainalle.org</a> &nbsp; <a href="{HOME[lang]}">sydanukrainalle.org</a> &nbsp; <a href="{BASE[lang]}feed.xml">RSS</a> &nbsp; <a href="{privacy_href(lang)}">{E({'en': 'Privacy policy', 'fi': 'Tietosuojaseloste', 'uk': 'Політика конфіденційності'}[lang])}</a></p>
  </div>
</footer>
</body>
</html>
"""


def tag(it, lang):
    return T[lang]["gmah"] if it.get("kind") == "gmah" else T[lang]["industry"]


def card(it, lang, heading="h2"):
    t = it[lang]
    url = f"{BASE[lang]}{it['slug']}/"
    img = ""
    cls = "news-card"
    if it.get("image_small") or it.get("image"):
        src = it.get("image_small") or it["image"]
        img = f'<a href="{url}" tabindex="-1"><img src="{src}" alt="{E(t["title"])}" loading="lazy" width="640" height="480"></a>'
    else:
        cls += " noimg"
    return f"""<li class="{cls}">{img}<div>
  <div class="meta"><span class="tag">{E(tag(it, lang))}</span><time datetime="{it['date']}">{fmt_date(it['_date'], lang)}</time></div>
  <{heading}><a href="{url}">{E(t['title'])}</a></{heading}>
  <p>{E(t['summary'])}</p>
  <a href="{url}">{E(T[lang]['read'])}</a>
</div></li>"""


def breadcrumbs(lang, crumbs):
    """crumbs: list of (name, path or None). Returns (html, jsonld)."""
    parts = []
    for name, path in crumbs:
        parts.append(f'<a href="{path}">{E(name)}</a>' if path else f'<span aria-current="page">{E(name)}</span>')
    html_ = f'<nav class="crumbs" aria-label="Breadcrumb">{" › ".join(parts)}</nav>'
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, **({"item": f"{SITE}{p}"} if p else {})}
        for i, (n, p) in enumerate(crumbs)]}
    return html_, ld


def build_list(items, lang):
    t = T[lang]
    cards = "\n".join(card(i, lang) for i in items)
    bc_html, bc_ld = breadcrumbs(lang, [(t["bc_home"], HOME[lang]), (t["bc_news"], None)])
    body = f"""<section class="hero">
  <div class="wrap">
    {bc_html}
    <span class="kicker">{E(t['kicker'])}</span>
    <h1>{E(t['list_title'])}</h1>
    <p class="lead">{E(t['list_desc'])}</p>
  </div>
</section>
<div class="wrap"><ul class="news-list">
{cards}
</ul></div>"""
    jsonld = {
        "@context": "https://schema.org", "@type": "CollectionPage", "name": t["list_title"],
        "description": t["list_desc"], "url": f"{SITE}{BASE[lang]}", "inLanguage": lang,
        "publisher": ORG_REF,
        "mainEntity": {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": n + 1, "url": f"{SITE}{BASE[lang]}{i['slug']}/"} for n, i in enumerate(items)]},
    }
    return page(lang, title=t["list_title"], desc=t["list_desc"][:DESC_MAX], url_path=BASE[lang], alt_paths=BASE, body=body, jsonld=[jsonld, bc_ld])


def build_item(it, lang, items=()):
    t = T[lang]
    x = it[lang]
    paths = {l: f"{BASE[l]}{it['slug']}/" for l in LANGS}
    paras = "\n".join(f"<p>{E(p)}</p>" for p in x["body"])
    fig = ""
    if it.get("image"):
        fig = f'<figure><img src="{it["image"]}" alt="{E(t["photo"])}" width="1200" height="800"><figcaption>{E(t["photo"])}</figcaption></figure>'
    why = f'<p class="why">{E(x["why"])}</p>' if x.get("why") else ""
    src = ""
    if it.get("sources"):
        lis = "".join(f'<li><a href="{E(s["url"])}" target="_blank" rel="noopener">{E(s["name"])}</a></li>' for s in it["sources"])
        src = f'<div class="sources"><b>{E(t["sources"] if len(it["sources"]) > 1 else t["source"])}:</b><ul>{lis}</ul></div>'
    c1, c2 = t["cta1"], t["cta2"]
    bc_html, bc_ld = breadcrumbs(lang, [(t["bc_home"], HOME[lang]), (t["bc_news"], BASE[lang]), (x["title"], None)])
    upd = ""
    if it.get("_updated"):
        upd = f' <span>{E(t["updated"])}: <time datetime="{it["updated"]}">{fmt_date(it["_updated"], lang)}</time></span>'
    others = [o for o in items if o["slug"] != it["slug"]][:3]
    related = ""
    if others:
        related = f'<section class="related"><h2>{E(t["related"])}</h2><ul class="news-list">' + "".join(card(o, lang, heading="h3") for o in others) + "</ul></section>"
    body = f"""<article class="news">
<section class="hero" style="padding-bottom:0">
  <div class="wrap">
    {bc_html}
    <div class="meta"><span class="tag">{E(tag(it, lang))}</span><time datetime="{it['date']}">{fmt_date(it['_date'], lang)}</time>{upd}</div>
    <h1>{E(x['title'])}</h1>
    <p class="lead">{E(x['summary'])}</p>
  </div>
</section>
<div class="wrap">
{fig}
{paras}
{why}
{src}
<div class="cta"><h2>{E(t['cta_t'])}</h2><p>{E(t['cta'])}</p><div class="actions"><a class="btn" href="{c1[1]}">{E(c1[0])}</a><a class="btn ghost" href="{c2[1]}">{E(c2[0])}</a></div></div>
</div>
</article>
<div class="wrap">{related}</div>"""
    jsonld = {
        "@context": "https://schema.org", "@type": "NewsArticle", "headline": x["title"],
        "description": x.get("description") or x["summary"], "datePublished": it["date"],
        "dateModified": it.get("updated") or it["date"], "inLanguage": lang,
        "mainEntityOfPage": f"{SITE}{paths[lang]}",
        "image": [f"{SITE}{it['image']}"] if it.get("image") else [f"{SITE}/og-image.png"],
        "author": ORG_REF,
        "publisher": ORG_REF,
    }
    if x.get("keywords"):
        jsonld["keywords"] = ", ".join(x["keywords"])
    if it.get("sources"):
        jsonld["isBasedOn"] = [s["url"] for s in it["sources"]]
    og = f"{SITE}{it['image']}" if it.get("image") else None
    head = f'<meta property="article:published_time" content="{it["date"]}">\n'
    if it.get("updated"):
        head += f'<meta property="article:modified_time" content="{it["updated"]}">\n'
    return page(lang, title=x.get("seo_title") or x["title"], desc=x.get("description") or x["summary"], url_path=paths[lang],
                alt_paths=paths, body=body, og_type="article", jsonld=[jsonld, bc_ld], og_image=og, extra_head=head)


def build_rss(items, lang):
    t = T[lang]
    now = format_datetime(datetime.now(timezone.utc))
    entries = []
    for it in items[:30]:
        x = it[lang]
        link = f"{SITE}{BASE[lang]}{it['slug']}/"
        pub = format_datetime(datetime(it["_date"].year, it["_date"].month, it["_date"].day, 9, 0, tzinfo=timezone.utc))
        entries.append(f"<item><title>{E(x['title'])}</title><link>{link}</link><guid>{link}</guid><pubDate>{pub}</pubDate><description>{E(x['summary'])}</description></item>")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>{E(t['list_title'])} — Global Mine Action Hub</title>
<link>{SITE}{BASE[lang]}</link>
<description>{E(t['list_desc'])}</description>
<language>{lang}</language>
<lastBuildDate>{now}</lastBuildDate>
{chr(10).join(entries)}
</channel></rss>
"""


def replace_block(text, start, end, new, insert_before=None):
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    block = f"{start}\n{new}\n{end}"
    if pat.search(text):
        return pat.sub(lambda m: block, text)
    if insert_before is None or insert_before not in text:
        raise SystemExit(f"cannot place block {start}")
    return text.replace(insert_before, block + "\n" + insert_before, 1)


def update_sitemap(items):
    p = PUB / "sitemap.xml"
    s = p.read_text(encoding="utf-8")
    newest = max((i.get("updated") or i["date"]) for i in items) if items else date.today().isoformat()
    groups = [(BASE, newest)] + [({l: f"{BASE[l]}{it['slug']}/" for l in LANGS}, it.get("updated") or it["date"]) for it in items]
    urls = []
    for g, lastmod in groups:
        alts = "".join(f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE}{g[l]}"/>' for l in ("en", "uk", "fi"))
        alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{g["en"]}"/>'
        for l in ("en", "uk", "fi"):
            urls.append(f"  <url><loc>{SITE}{g[l]}</loc><lastmod>{lastmod}</lastmod>{alts}\n  </url>")
    s = replace_block(s, "<!-- news:start -->", "<!-- news:end -->", "\n".join(urls), insert_before="</urlset>")
    p.write_text(s, encoding="utf-8")


def update_home(items, lang):
    p = PUB / HOME[lang].lstrip("/") / "index.html"
    s = p.read_text(encoding="utf-8")
    t = T[lang]
    cards = "\n".join(card(i, lang, heading="h3") for i in items[:3])
    block = f"""<section id="news" class="news-home">
  <div class="wrap">
    <h2>{E(t['latest'])}</h2>
    <ul class="news-list home">
{cards}
    </ul>
    <p><a class="btn ghost" href="{BASE[lang]}">{E(t['all_link'])}</a></p>
  </div>
</section>
<style>
.news-home .news-list{{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:0;margin:24px 0;list-style:none}}
.news-home .news-card{{display:flex;flex-direction:column;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px}}
.news-home .news-card img{{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;border-radius:8px;display:block}}
.news-home .news-card h3{{font-size:1.2rem;margin:.3em 0}}
.news-home .news-card h3 a{{color:var(--ink);text-decoration:none}}
.news-home .news-card h3 a:hover{{color:var(--orange)}}
.news-home .news-card p{{font-size:.95rem;margin:0 0 .6em}}
.news-home .meta{{font-size:.8rem;color:var(--muted);display:flex;gap:10px;flex-wrap:wrap}}
.news-home .tag{{color:var(--orange);font-weight:600;text-transform:uppercase;letter-spacing:.05em}}
@media (max-width:900px){{.news-home .news-list{{grid-template-columns:1fr}}}}
</style>"""
    s = replace_block(s, "<!-- news-block:start -->", "<!-- news-block:end -->", block, insert_before='<section id="contact"')
    p.write_text(s, encoding="utf-8")


def main():
    items = load_items()
    for lang in LANGS:
        base = PUB / BASE[lang].strip("/")
        # remove pages of news items that no longer exist
        if base.exists():
            keep = {i["slug"] for i in items}
            for d in base.iterdir():
                if d.is_dir() and d.name not in keep:
                    shutil.rmtree(d)
        base.mkdir(parents=True, exist_ok=True)
        (base / "index.html").write_text(build_list(items, lang), encoding="utf-8")
        (base / "feed.xml").write_text(build_rss(items, lang), encoding="utf-8")
        for it in items:
            d = base / it["slug"]
            d.mkdir(exist_ok=True)
            (d / "index.html").write_text(build_item(it, lang, items), encoding="utf-8")
        update_home(items, lang)
    update_sitemap(items)
    print(f"Built {len(items)} news items × {len(LANGS)} languages.")


if __name__ == "__main__":
    main()
