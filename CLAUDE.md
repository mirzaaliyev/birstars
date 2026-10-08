# Bir Stars — notes for Claude

Birthday site for the CEO of the Bir ecosystem. Owner: Mirza (design lead). All UI copy is Russian; names in the data are often Azerbaijani (ə, ğ, ş, İ, ı) — keep the font subset covering them.

## Architecture
- Cloudflare Worker with static assets (configured in `wrangler.jsonc`), no build step. `public/` is the assets directory; `src/index.js` is the Worker entry and runs before every asset (`assets.run_worker_first: true`); shared server code lives in `lib/`.
- `src/index.js` gates everything: public paths are `/assets/*`, `/robots.txt`, `/og.png`, `/favicon.svg`, `/api/login`. Without the recipient cookie any page returns the password screen (`lib/pages.js`). `/admin` and `/api/admin/*` need the admin cookie; the admin cookie also grants the recipient pages. Page loads of `/`, `/force`, `/galaxy` by the recipient (not the admin) are logged to `visits`.
- `lib/api.js` (`handleApi`) is the whole JSON API. Tables are created lazily in `lib/db.js` — no migrations.
- Cookies are HMAC-signed with a key derived from `SITE_PASSWORD` + `ADMIN_PASSWORD` (or `SESSION_SECRET` if set). Changing a password signs everyone out.
- Editable texts and video links: `lib/settings.js` `DEFAULTS`. Adding a key there + a field in `public/admin.html` (`TEXT_KEYS` in `admin.js`) is all it takes.
- Video: `public/assets/video.js` parses Cloudflare Stream (link / embed code / 32-hex id) or YouTube links and mounts the player; the end screen uses the Stream SDK / YouTube IFrame API.
- Sky: `public/assets/galaxy.js` (d3-force layout + canvas, d3-zoom). Layout parameters interpolate between 30 and 120 stars (`layoutParams`). Star positions are seeded by star id, so they are stable between visits. Tap detection is done on pointer events, not on `click` (d3-zoom swallows clicks with tiny pointer movement) — keep it that way.
- Transition `/force` → `/galaxy` is `public/assets/warp.js` (sessionStorage flag `birstars-warp`).

## Rules
- User content (names, texts) is always inserted with `textContent`, never `innerHTML`.
- Visual language: black sky with a faint blue tint (hsl 210–212), white stars, white primary buttons, Google Sans. No colour accents.
- Respect `prefers-reduced-motion` in every animation.

## Testing locally
```
cp .dev.vars.example .dev.vars
npx wrangler dev        # uses a local D1 copy; while wrangler.jsonc has no database_id yet, add a d1_databases block with any UUID in a scratch copy of the config
```
Check in a real browser (Playwright is fine): sign-in, both video pages, star taps on desktop and with touch emulation, admin import/edit/delete, the "continue" switch.

## Deploying
Push to `main` — Workers Builds runs `npx wrangler deploy` automatically. `wrangler.jsonc` is the source of truth for bindings (D1 `DB`); the two passwords are Worker secrets set in the dashboard (see README). Never add plain-text vars in the dashboard — a deploy removes them.
