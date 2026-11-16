import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import enquiry from '../api/enquiry.js'

const dist = resolve('dist')
const config = JSON.parse(await readFile('vercel.json', 'utf8'))
const redirects = new Map(config.redirects.map(item => [item.source, item]))
const rewrites = new Map(config.rewrites.map(item => [item.source, item.destination]))
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.otf': 'font/otf', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }
const port = Number(process.env.PORT || 5179)

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/api/enquiry') {
    try {
      let raw = ''
      for await (const chunk of request) { raw += chunk; if (raw.length > 16000) throw new Error('too-large') }
      request.body = JSON.parse(raw || '{}')
      response.status = code => { response.statusCode = code; return response }
      response.json = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); return response }
      await enquiry(request, response)
    } catch { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ok: false, reason: 'invalid-input' })) }
    return
  }
  const redirect = redirects.get(pathname)
  if (redirect) { response.writeHead(redirect.statusCode, { Location: redirect.destination }); response.end(); return }
  const mapped = pathname === '/' ? '/index.html' : rewrites.get(pathname) || pathname
  const file = resolve(join(dist, '.' + mapped))
  if (!file.startsWith(dist + '/')) { response.writeHead(404); response.end(); return }
  try {
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
    response.end(data)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(await readFile(join(dist, '404.html')))
  }
}).listen(port, '127.0.0.1', () => console.log('Moreward preview: http://127.0.0.1:' + port))
