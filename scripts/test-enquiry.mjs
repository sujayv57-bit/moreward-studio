import assert from 'node:assert/strict'
import handler from '../api/enquiry.js'

const originalFetch = globalThis.fetch
const originalKey = process.env.RESEND_API_KEY
const originalFrom = process.env.ENQUIRY_FROM
const payload = { name: 'Alex Morgan', email: 'alex@example.com', company: 'North Studio', service: 'creative-marketing', message: 'We are preparing a new brand launch next quarter.', website: '', startedAt: Date.now() - 5000 }

async function call(body) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
  await handler({ method: 'POST', body }, res)
  return res
}

try {
  delete process.env.RESEND_API_KEY
  delete process.env.ENQUIRY_FROM
  assert.equal((await call({ ...payload, email: 'invalid' })).body.reason, 'invalid-input')
  assert.equal((await call({ ...payload, website: 'bot.example' })).body.ok, true)
  assert.equal((await call({ ...payload, startedAt: Date.now() })).body.ok, true)
  const missing = await call(payload)
  assert.equal(missing.statusCode, 503)
  assert.equal(missing.body.reason, 'not-configured')
  process.env.RESEND_API_KEY = 'test-key'
  process.env.ENQUIRY_FROM = 'Moreward <hello@example.com>'
  let sent
  globalThis.fetch = async (url, options) => { sent = { url, options }; return { ok: true } }
  const success = await call(payload)
  assert.equal(success.body.ok, true)
  assert.equal(sent.url, 'https://api.resend.com/emails')
  const message = JSON.parse(sent.options.body)
  assert.equal(message.to[0], 'sujay@nidhivriddhi.com')
  assert.equal(message.reply_to, payload.email)
  assert.equal(message.subject, 'Project enquiry — North Studio')
  console.log('Enquiry validation, spam checks, missing configuration and Resend payload passed.')
} finally {
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalKey
  if (originalFrom === undefined) delete process.env.ENQUIRY_FROM
  else process.env.ENQUIRY_FROM = originalFrom
}
