# pink-carousel-bot

Daily Pink Media Instagram carousel generator. Cloud-portable: no local Chrome or macOS tools.

## Daily routine (what the scheduled agent does)
1. Web-search AI / SEO / PPC news from the last 3 days; pick the strongest single story.
2. Write `content/<YYYY-MM-DD>.json` strictly following `SPEC.md` (persona, ironclad rules, 7-slide structure, rotating format).
3. `npm run setup` (first run installs Playwright chromium), then `MAKE_API_TOKEN=xxx node render.js <YYYY-MM-DD>`.
   - Renders 7 JPEG slides (1080x1350) from `carousel.html` via Playwright.
   - Uploads each to Cloudinary (unsigned preset, no secret).
   - Writes one record to Make Data Store 124678 via the Make API v2 (`MAKE_API_TOKEN` env var).
4. Make scenario "Pink Carousel Auto Publisher" posts the carousel to Instagram at 19:00 Asia/Jerusalem.

## Notes
- `carousel.html` is a data-driven template; large mobile-first type. Do not shrink fonts.
- Keep `h` short and `sub` to ~2 lines per slide so nothing overflows.
- Cloudinary cloud `duhfkgxer`, unsigned preset `fi604fpo` (folder pink_carousel).
- The Make webhook and publisher are already configured; this repo only produces and queues content.
