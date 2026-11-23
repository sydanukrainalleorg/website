# sydanukrainalle.org

Website of Global Mine Action Hub, a programme of Sydän Ukrainalle ry (Y-tunnus 3543515-1).

- `public/` — website pages in English (/), Ukrainian (/uk/) and Finnish (/fi/), privacy policies, icons, sitemap
- `src/worker.js` — forms (callback, dog programme, donation updates) → Telegram, site chat and Telegram bot (AI)
- `src/knowledge.js` — everything the chat assistant and the Telegram bot know
- `wrangler.jsonc` — Cloudflare settings
- `news/` — news items, one JSON file each, in EN/FI/UK (summaries in our own words + link to the source)
- `tools/build_news.py` — builds the News section (/news/, /fi/uutiset/, /uk/novyny/), RSS feeds, the "Latest news" block on the home pages and the sitemap

## Adding a news item

1. Copy any file in `news/`, rename it `YYYY-MM-DD-short-slug.json`, change `slug`, `date`, `sources` and the texts in `en`, `fi`, `uk` (`kind`: `industry` for sector news, `gmah` for our own news; `image` is optional).
2. Run `python3 tools/build_news.py`.
3. Commit and push to `main`.

Do not copy other sites' articles: write a short summary in our own words and link to the original. Full SEO rules for every publication: see CLAUDE.md.

Every change pushed to the `main` branch is published automatically by Cloudflare.

Contact: info@sydanukrainalle.org
