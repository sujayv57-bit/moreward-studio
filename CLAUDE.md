# Moreward Studio site

Vite + React site, deployed on Vercel (project `moreward-studio`, team `sujay-s-projects2`).

## Deployment rules (from the site owner)

- Make changes on a working branch and push them there. Vercel builds a preview link for every pushed branch.
- **Never push or merge to `main` unless the owner explicitly asks to put changes live.** `main` is the production branch: anything on it goes live at moreward-studio.vercel.app.
- After pushing, share the Vercel preview link so the owner can review.

## Project notes

- Build: `npm ci && npm run build` (Vite build + SSR prerender into `dist/`).
- Source of truth: `src/App.jsx` (routes), `src/baseline/*` (pages, header/menu/footer, form, data/copy in `data.js`), `src/config/site.js` (STUDIO_EMAIL, per-page SEO, public paths), `src/config/schema.js` (JSON-LD).
- Stylesheets: `src/baseline.css`, `src/hero.css`, `src/overhaul.css`, `src/why.css` (imported in `src/main.jsx`, in that order). `why.css` styles the Home "Why Moreward" bento section (`src/baseline/why.jsx`).
- Image placeholders: `placeholder(label, w, h)` in `src/baseline/data.js` marks slots awaiting images; swap for `image(id, w, h)` once files are in `public/images` (480/960/full widths, AVIF + WebP).
- Fonts are self-hosted in `public/fonts`: Archivo (headings), DM Sans (body), Geist Mono (small labels). Blauer Nue Regular is kept only for the arrow glyphs. No third-party font requests (the privacy page states this).
- `scripts/prerender.mjs` writes static HTML for every route plus `404.html`, `sitemap.xml`, `robots.txt` and `llms.txt`. Redirects live in `vercel.json`.
- Client case studies can be standalone HTML pages in `public/work/<slug>/` (e.g. `public/work/betach/`). Their card in `src/baseline/data.js` has `client: true` and `href`, so it opens with a full page load. Add the path to `STATIC_PATHS` in `src/config/site.js` (sitemap) and a rewrite in `vercel.json`. Self-host any fonts they use.
- Tests: `node scripts/test-enquiry.mjs` (API). `npm run preview` serves `dist/` with the vercel.json redirects.
- Contact form handler: `api/enquiry.js` (needs `RESEND_API_KEY` and `ENQUIRY_FROM` set in Vercel environment variables).
