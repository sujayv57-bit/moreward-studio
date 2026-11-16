# Moreward Studio site

Vite + React site, deployed on Vercel (project `moreward-studio`, team `sujay-s-projects2`).

## Deployment rules (from the site owner)

- Make changes on a working branch and push them there. Vercel builds a preview link for every pushed branch.
- **Never push or merge to `main` unless the owner explicitly asks to put changes live.** `main` is the production branch: anything on it goes live at moreward-studio.vercel.app.
- After pushing, share the Vercel preview link so the owner can review.

## Project notes

- Build: `npm ci && npm run build` (Vite build + SSR prerender into `dist/`).
- Live stylesheets: `src/baseline.css`, `src/hero.css`, `src/overhaul.css` (imported in `src/main.jsx`). Other CSS files in `src/` are unused leftovers.
- Fonts: Archivo (headings), DM Sans (body), Geist Mono (small labels). Google Fonts link is in `index.html`.
- Contact form handler: `api/enquiry.js` (needs `RESEND_API_KEY` and `ENQUIRY_FROM` set in Vercel environment variables).
