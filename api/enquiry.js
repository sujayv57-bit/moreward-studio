import { STUDIO_EMAIL } from '../src/config/site.js'

const allowed = new Set(['', 'creative-marketing', 'advertising-media', 'technology-automation', 'mix', 'not-sure'])
const labels = { 'creative-marketing': 'Creative & Marketing', 'advertising-media': 'Advertising & Media', 'technology-automation': 'Technology & Automation', mix: 'A mix of these', 'not-sure': 'Not sure yet' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'method-not-allowed' })
  let body
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return res.status(400).json({ ok: false, reason: 'invalid-input' }) }
  const { name = '', email = '', company = '', service = '', message = '', website = '', startedAt } = body
  if (website || !Number.isFinite(Number(startedAt)) || Date.now() - Number(startedAt) < 3000) return res.status(200).json({ ok: true })
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof message !== 'string' || message.trim().length < 20 || typeof company !== 'string' || !allowed.has(service)) return res.status(400).json({ ok: false, reason: 'invalid-input' })
  if (!process.env.RESEND_API_KEY || !process.env.ENQUIRY_FROM) return res.status(503).json({ ok: false, reason: 'not-configured' })
  const subject = `Project enquiry — ${(company.trim() || name.trim()).slice(0, 120)}`
  const content = [`Name: ${name.trim()}`, `Work email: ${email.trim()}`, `Company: ${company.trim() || '—'}`, `Looking for: ${labels[service] || '—'}`, `Details: ${message.trim()}`].join('\n\n')
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.ENQUIRY_FROM, to: [process.env.ENQUIRY_TO || STUDIO_EMAIL], reply_to: email.trim(), subject, text: content }) })
    if (!response.ok) return res.status(502).json({ ok: false, reason: 'delivery-failed' })
    return res.status(200).json({ ok: true })
  } catch { return res.status(502).json({ ok: false, reason: 'delivery-failed' }) }
}
