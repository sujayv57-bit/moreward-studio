import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PUBLIC_PATHS, STATIC_PATHS, seo, STUDIO_EMAIL } from '../src/config/site.js'
import { schemaFor } from '../src/config/schema.js'

const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://moreward.studio').replace(/\/$/, '')
const template = await readFile('dist/index.html', 'utf8')
const { render } = await import(pathToFileURL(join(process.cwd(), '.ssr/entry-server.js')).href)
const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function documentFor(path, markup) {
  const data = seo[path] || seo['404']
  const canonical = siteUrl + (path === '404' ? '/404' : path)
  const image = siteUrl + (data.image || '/social-card.png')
  const type = 'website'
  const meta = [
    '<meta name="description" content="' + escape(data.description) + '">',
    '<link rel="canonical" href="' + escape(canonical) + '">',
    '<meta property="og:type" content="' + type + '">',
    '<meta property="og:title" content="' + escape(data.title) + '">',
    '<meta property="og:description" content="' + escape(data.description) + '">',
    '<meta property="og:image" content="' + escape(image) + '">',
    '<meta property="og:url" content="' + escape(canonical) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + escape(data.title) + '">',
    '<meta name="twitter:description" content="' + escape(data.description) + '">',
    '<meta name="twitter:image" content="' + escape(image) + '">',
    data.noindex ? '<meta name="robots" content="noindex,follow">' : '',
    '<script id="moreward-schema" type="application/ld+json">' + JSON.stringify(schemaFor(path === '404' ? '/404' : path, siteUrl)).replace(/</g, '\\u003c') + '</script>',
    '<link rel="preload" href="/fonts/Archivo-Variable.woff2" as="font" type="font/woff2" crossorigin>',
    path === '/' ? '<link rel="preload" href="/media/hero-poster.webp" as="image" fetchpriority="high">' : '',
  ].filter(Boolean).join('\n    ')
  const clean = template
    .replace(/<meta name="description"[^>]*>\s*/g, '')
    .replace(/<meta property="og:[^"]+"[^>]*>\s*/g, '')
    .replace(/<meta name="twitter:[^"]+"[^>]*>\s*/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + escape(data.title) + '</title>')
  const rootMarkup = markup.replace(/^<!DOCTYPE html>/i, '').replace(/<link rel="preload" as="image"[^>]*>/g, '')
  return clean.replace('</head>', '    ' + meta + '\n  </head>').replace('<div id="root"></div>', '<div id="root">' + rootMarkup + '</div>')
}

for (const path of [...PUBLIC_PATHS, '/404']) {
  const markup = await render(path)
  if (!markup.includes('<h1')) throw new Error('Missing H1 on ' + path)
  const target = path === '/404' ? 'dist/404.html' : path === '/' ? 'dist/index.html' : 'dist' + path + '/index.html'
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, documentFor(path === '/404' ? '404' : path, markup))
}

const urls = [...PUBLIC_PATHS, ...STATIC_PATHS].map(path => '  <url><loc>' + escape(siteUrl + path) + '</loc></url>').join('\n')
await writeFile('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n')
await writeFile('dist/robots.txt', 'User-agent: *\nAllow: /\nSitemap: ' + siteUrl + '/sitemap.xml\n')
await writeFile('dist/llms.txt', `# Moreward Studio
Moreward is an independent creative and technology studio. Brand line: "Direction, made visible."
It works across three disciplines, often in one project:
- Creative & Marketing: positioning, brand identity, advertising design, campaigns, creator marketing, content.
- Advertising & Media: outdoor, billboard, metro, television, radio and print advertising; media planning.
- Technology & Automation: websites, custom CRMs, workflow and AI automation.
Pages
- Home: overview, disciplines, tools and approach.
- Work: brand identities for BETACH Consulting Services, Kriya Setu and Rucaa, plus the BETACH website (live at betach.in); the studio's principles and ways of working (no fixed packages).
- Capabilities: the three disciplines, the studio and how we work.
- Contact: enquiry form, or email ${STUDIO_EMAIL}.
`)
