import { useEffect, useRef, useState } from 'react'
import { STUDIO_EMAIL } from '../config/site.js'
import { EmailLink, trackEvent } from './ui.jsx'

const choices = [
  ['creative-marketing', 'Creative & Marketing'],
  ['advertising-media', 'Advertising & Media'],
  ['technology-automation', 'Technology & Automation'],
  ['mix', 'A mix of these'],
  ['not-sure', 'Not sure yet'],
]

const nextSteps = [
  'We read your message.',
  'We reply to set up a first conversation.',
  'We come back with a proposed direction and scope.',
]

export function NextSteps() {
  return <div className="b-contact-next"><p className="b-contact-next__label">What happens next</p><ol>{nextSteps.map((step, i) => <li key={step}><span>0{i + 1}</span>{step}</li>)}</ol></div>
}

const initial = { name: '', email: '', phone: '', company: '', service: '', message: '', website: '' }

// A callable number: digits with optional +, spaces, brackets or dashes; 8 to 15 digits (with country code if outside India).
export const validPhone = value => /^[+\d\s()-]+$/.test(value.trim()) && (value.replace(/\D/g, '').length >= 8 && value.replace(/\D/g, '').length <= 15)

function validate(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Please enter your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Please enter a valid email address.'
  if (!validPhone(values.phone)) errors.phone = 'Please enter a phone number we can call (add the country code if outside India).'
  if (values.message.trim().length < 20) errors.message = 'Please tell us a little more (at least 20 characters).'
  return errors
}

function emailContent(values) {
  const subject = 'Project enquiry — ' + (values.company.trim() || values.name.trim())
  const selected = choices.find(([value]) => value === values.service)?.[1] || '—'
  const body = ['Name: ' + values.name, 'Work email: ' + values.email, 'Phone: ' + values.phone, 'Company: ' + (values.company || '—'), 'Looking for: ' + selected, 'Details: ' + values.message].join('\n')
  return { subject, body }
}

export function ContactForm() {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [serverError, setServerError] = useState(false)
  const startedAt = useRef(Date.now())
  const summaryRef = useRef(null)
  const successRef = useRef(null)

  useEffect(() => {
    const service = new URLSearchParams(window.location.search).get('service')
    if (choices.some(([value]) => value === service)) setValues(previous => ({ ...previous, service }))
  }, [])

  useEffect(() => {
    if (status === 'success') successRef.current?.focus()
  }, [status])

  const change = event => {
    const { name, value } = event.target
    setValues(previous => ({ ...previous, [name]: value }))
    if (errors[name]) setErrors(previous => ({ ...previous, [name]: undefined }))
    if (serverError) setServerError(false)
  }

  const blurEmail = () => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
    setErrors(previous => ({ ...previous, email: valid ? undefined : 'Please enter a valid email address.' }))
  }

  const submit = async event => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      if (Object.keys(found).length >= 2) requestAnimationFrame(() => summaryRef.current?.focus())
      else requestAnimationFrame(() => document.getElementById('enquiry-' + Object.keys(found)[0])?.focus())
      return
    }

    setStatus('sending')
    setServerError(false)
    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, startedAt: startedAt.current }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.reason || 'server-error')
      setStatus('success')
      trackEvent('enquiry_success')
    } catch {
      setStatus('idle')
      setServerError(true)
      trackEvent('enquiry_error')
    }
  }

  if (status === 'success') {
    const firstName = values.name.trim().split(/\s+/)[0]
    return <div className="b-contact-success" role="status"><h2 ref={successRef} tabIndex="-1">Thanks, {firstName}. Your message is with us.</h2><p>We'll call you on {values.phone.trim()} or reply to {values.email}.</p><NextSteps/></div>
  }

  const count = Object.values(errors).filter(Boolean).length
  const mail = emailContent(values)
  const fieldError = name => errors[name] ? <small className="b-field-error" id={'enquiry-' + name + '-error'}>{errors[name]}</small> : null
  const invalid = name => errors[name] ? true : undefined
  const described = name => errors[name] ? 'enquiry-' + name + '-error' : undefined

  return <form className="b-contact-form" onSubmit={submit} noValidate>
    {count >= 2 && <div className="b-form-summary" role="alert" tabIndex="-1" ref={summaryRef}>Please check the highlighted fields before sending.</div>}
    <div className="b-contact-form__pair">
      <label htmlFor="enquiry-name">Name <span>*</span><input id="enquiry-name" name="name" autoComplete="name" placeholder="Your name" value={values.name} onChange={change} aria-invalid={invalid('name')} aria-describedby={described('name')} required/>{fieldError('name')}</label>
      <label htmlFor="enquiry-email">Work email <span>*</span><input id="enquiry-email" name="email" type="email" autoComplete="email" placeholder="you@company.com" value={values.email} onChange={change} onBlur={blurEmail} aria-invalid={invalid('email')} aria-describedby={described('email')} required/>{fieldError('email')}</label>
    </div>
    <div className="b-contact-form__pair">
      <label htmlFor="enquiry-phone">Phone <span>*</span><input id="enquiry-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value={values.phone} onChange={change} aria-invalid={invalid('phone')} aria-describedby={described('phone')} required/>{fieldError('phone')}</label>
      <label htmlFor="enquiry-company">Company<input id="enquiry-company" name="company" autoComplete="organization" placeholder="Company or brand" value={values.company} onChange={change}/></label>
    </div>
    <label htmlFor="enquiry-service">What do you need?<select id="enquiry-service" name="service" value={values.service} onChange={change}><option value="">Choose one</option>{choices.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label htmlFor="enquiry-message">Tell us about it <span>*</span><textarea id="enquiry-message" name="message" required rows="5" minLength={20} placeholder="What are you trying to achieve, and by when?" value={values.message} onChange={change} onInput={event => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = event.currentTarget.scrollHeight + 'px' }} aria-invalid={invalid('message')} aria-describedby={described('message')}/>{fieldError('message')}</label>
    <div className="b-honeypot" aria-hidden="true"><label htmlFor="enquiry-website">Leave this field empty</label><input id="enquiry-website" name="website" tabIndex="-1" autoComplete="off" value={values.website} onChange={change}/></div>
    {serverError && <p className="b-form-server-error" role="alert">Something went wrong on our side. Email us directly at <EmailLink subject={mail.subject} body={mail.body}>{STUDIO_EMAIL}</EmailLink>.</p>}
    <button className="b-pill b-pill--submit" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send enquiry'}</button>
  </form>
}
