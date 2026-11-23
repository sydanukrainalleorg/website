# sydanukrainalle.org — rules for Claude

Static site (Global Mine Action Hub / Sydän Ukrainalle ry). `public/` is published by Cloudflare on every push to `main`.
Languages: EN (`/`), FI (`/fi/`), UK (`/uk/`). Every public page exists in all three languages with hreflang links between them.

## Every news item / publication must be SEO-complete

The owner's goal: maximum visibility of the organisation in search engines. Apply these rules to every news item and every new page — no exceptions.

1. **Three languages, one slug.** One file `news/YYYY-MM-DD-slug.json` with `en`, `fi`, `uk`. Slug: lowercase latin, dashes, contains the main keyword (e.g. `poltava-mine-detection-dogs-certified`).
2. **Search title** `seo_title`: ≤ 65 characters, main keyword first, then the specific fact (place, number, date). The visible `title` can be longer.
3. **Meta description** `description`: 70–160 characters, contains the keyword and a concrete fact, reads like an invitation to click.
4. **Keywords** `keywords`: 4–6 phrases people actually search in that language (e.g. "humanitarian demining Ukraine", "miinanraivaus Ukraina", "гуманітарне розмінування", "mine detection dogs", "кінолог"). Check volumes in Google Ads Keyword Planner when in doubt.
5. **Own words only.** Never copy other sites' articles. Short summary of the facts + link(s) to the original source in `sources` + a "Why it matters to us" paragraph (`why`) linking the news to GMAH's work. This is both copyright-safe and what search engines treat as original content.
6. **Facts from primary sources** (government, SESU, UN, operators). Name the date and the source.
7. **Image**: use a relevant image from `public/img/` (`image` + `image_small`); it is shown as "Illustrative photo". Never use photos of real people taken from other sites.
8. **Build**: run `python3 tools/build_news.py`. It must print no `WARNING` lines (it checks title/description length). It generates: list pages, article pages with NewsArticle + BreadcrumbList structured data, breadcrumbs, "More news" internal links, RSS feeds, sitemap with `lastmod` and hreflang, and the "Latest news" block on the home pages.
9. **Update**: when correcting an item later, add `"updated": "YYYY-MM-DD"` — it becomes `dateModified` and the sitemap `lastmod`.
10. **Publish**: commit, push to `main`, then check the live URLs. After publishing, ask Google to index the new URLs in Search Console (URL inspection → Request indexing) when access is available.
11. **Give the owner a full Russian translation** of every published text (he does not read Finnish and reads little English).

## Site-wide SEO that must stay in place
- Home pages carry NGO + WebSite structured data between `<!-- org-ld:start -->` and `<!-- org-ld:end -->` (name, legal name, Y-tunnus, address, contacts, social profiles in `sameAs`). Keep it in sync with real contacts and social accounts.
- Each page: one `<h1>`, unique `<title>` and meta description, canonical URL, hreflang EN/FI/UK + x-default, Open Graph tags.
- `public/sitemap.xml`: the news part is generated between `<!-- news:start -->` and `<!-- news:end -->`; add new static pages above that block by hand.
- `robots.txt` allows everything and points to the sitemap.
- Never remove the `google-site-verification` and `msvalidate.01` meta tags from `public/index.html`: they keep the site verified in Google Search Console and Bing Webmaster Tools (account alxx.roi@gmail.com).
