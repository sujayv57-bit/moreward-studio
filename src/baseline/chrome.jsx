import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities, navigation } from './data.js'
import { seo, STUDIO_EMAIL } from '../config/site.js'
import { schemaFor } from '../config/schema.js'
import { ConversionLink, EmailLink } from './ui.jsx'
const logoInk = '/images/wordmark-ink.webp'
const logoWhite = '/images/wordmark-white.webp'

const origin = import.meta.env.VITE_SITE_URL || 'https://moreward.studio'
const absolute = path => origin + path

export function Seo({ pathname }) {
  useEffect(() => {
    const data = seo[pathname] || seo['404']
    document.title = data.title
    const meta = (selector, attribute, key, value) => {
      let element = document.head.querySelector(selector)
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element) }
      element.setAttribute('content', value)
    }
    const canonicalPath = seo[pathname] ? pathname : '/404'
    const image = absolute(data.image || '/social-card.png')
    meta('meta[name="description"]', 'name', 'description', data.description)
    for (const [key, value] of Object.entries({ 'og:title': data.title, 'og:description': data.description, 'og:image': image, 'og:url': absolute(canonicalPath) })) meta('meta[property="' + key + '"]', 'property', key, value)
    for (const [key, value] of Object.entries({ 'twitter:title': data.title, 'twitter:description': data.description, 'twitter:image': image })) meta('meta[name="' + key + '"]', 'name', key, value)
    let canonical = document.head.querySelector('link[rel="canonical"]')
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
    canonical.href = absolute(canonicalPath)
    let robots = document.head.querySelector('meta[name="robots"]')
    if (data.noindex) { if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots) } robots.content = 'noindex,follow' } else robots?.remove()
    let json = document.head.querySelector('#moreward-schema')
    if (!json) { json = document.createElement('script'); json.id = 'moreward-schema'; json.type = 'application/ld+json'; document.head.appendChild(json) }
    json.textContent = JSON.stringify(schemaFor(pathname, origin))
  }, [pathname])
  return null
}

export function Loader() {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || sessionStorage.getItem('moreward-loaded')) { document.documentElement.classList.add('site-ready'); return }
    setVisible(true); document.body.classList.add('b-locked')
    const dismiss = () => { document.documentElement.classList.add('site-ready'); document.body.classList.remove('b-locked'); sessionStorage.setItem('moreward-loaded', '1'); setLeaving(true) }
    if (document.readyState === 'complete') requestAnimationFrame(dismiss)
    else window.addEventListener('load', dismiss, { once: true })
    const cap = window.setTimeout(dismiss, 1500)
    return () => { window.clearTimeout(cap); window.removeEventListener('load', dismiss); document.body.classList.remove('b-locked') }
  }, [])
  useEffect(() => { if (!leaving) return; const timer = setTimeout(() => setVisible(false), 700); return () => clearTimeout(timer) }, [leaving])
  if (!visible) return null
  return <div className={'b-loader' + (leaving ? ' b-loader--leaving' : '')} role="status" aria-label="Loading Moreward"><div><img src={logoWhite} alt="Moreward"/><div className="b-loader__track"><span/></div><p>DIRECTION, MADE VISIBLE.</p></div></div>
}

export function Header({ pathname }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [overDark, setOverDark] = useState(pathname === '/' || pathname === '/work' || pathname.startsWith('/work/') || pathname.startsWith('/capabilities/'))
  const [hidden, setHidden] = useState(false)
  const toggleRef = useRef(null), menuRef = useRef(null), headerRef = useRef(null)
  useEffect(() => {
    let previous = window.scrollY
    const onScroll = () => {
      const current = window.scrollY
      setScrolled(current > 50)
      const crossing = [...document.querySelectorAll('main>section')].find(section => { const rect = section.getBoundingClientRect(); return rect.top <= 65 && rect.bottom >= 65 })
      setOverDark(Boolean(crossing?.matches('.b-panel-dark,.m-hero')))
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !open && !headerRef.current?.contains(document.activeElement)) setHidden(current > previous && current > 160 && current - previous > 2)
      else setHidden(false)
      previous = current
    }
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open, pathname])
  useEffect(() => { setOpen(false); setHidden(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const main = document.querySelector('main'), footer = document.querySelector('.b-footer')
    document.body.classList.add('b-locked')
    if (main) main.inert = true
    if (footer) footer.inert = true
    menuRef.current?.querySelector('a')?.focus()
    const key = event => {
      if (event.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); return }
      if (event.key !== 'Tab') return
      const items = [...menuRef.current.querySelectorAll('a,button')], first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    const resize = () => { if (innerWidth >= 1024) setOpen(false) }
    window.addEventListener('keydown', key); window.addEventListener('resize', resize)
    return () => { document.body.classList.remove('b-locked'); if (main) main.inert = false; if (footer) footer.inert = false; window.removeEventListener('keydown', key); window.removeEventListener('resize', resize) }
  }, [open])
  const dark = overDark && !open
  const current = path => pathname === path || (path !== '/studio' && pathname.startsWith(path + '/'))
  const close = () => { setOpen(false); toggleRef.current?.focus() }
  return <><header ref={headerRef} className={'b-header' + (dark ? ' b-header--over' : ' b-header--light') + (scrolled ? ' b-header--scrolled' : '') + (dark && scrolled ? ' b-header--dark-surface' : '') + (hidden ? ' b-header--hidden' : '')} onFocusCapture={() => setHidden(false)}><Link className="b-header__logo" to="/" aria-label="Moreward home"><img src={dark ? logoWhite : logoInk} alt="Moreward"/></Link><nav className="b-header__left" aria-label="Primary">{navigation.slice(0, 3).map(item => <Link key={item.to} to={item.to} aria-current={current(item.to) ? 'page' : undefined} className={current(item.to) ? 'is-current' : ''}>{item.label}</Link>)}</nav><div className="b-header__right"><ConversionLink location="header" active={pathname === '/contact'} className="b-header__cta"/><button ref={toggleRef} className="b-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="b-menu" onClick={() => setOpen(!open)}><span/><span/></button></div></header>
    <div ref={menuRef} id="b-menu" className={'b-menu' + (open ? ' b-menu--open' : '')} aria-hidden={!open}><div className="b-menu__top"><Link to="/" tabIndex={open ? 0 : -1} onClick={close}><img src={logoWhite} alt="Moreward"/></Link><button aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={close}>×</button></div><nav aria-label="Full navigation">{navigation.map((item, i) => <Link key={item.to} to={item.to} tabIndex={open ? 0 : -1} onClick={close}><span>{two(i + 1)}</span>{item.label}</Link>)}</nav><div className="b-menu__secondary">{capabilities.map(item => <Link key={item.slug} to={'/capabilities/' + item.slug} tabIndex={open ? 0 : -1} onClick={close}>{item.name}</Link>)}</div><div className="b-menu__bottom"><EmailLink>{STUDIO_EMAIL}</EmailLink><span>INDEPENDENT CREATIVE &amp; TECHNOLOGY STUDIO</span></div></div></>
}

const two = number => String(number).padStart(2, '0')

export function Footer() {
  return <footer className="b-footer b-panel-dark"><div className="b-footer__main"><div className="b-footer__brand"><Link to="/" aria-label="Moreward home"><img src={logoWhite} alt="Moreward"/></Link><p>Moreward is an independent studio for creative, advertising and technology work.</p><EmailLink>{STUDIO_EMAIL}</EmailLink></div><div><span>CAPABILITIES</span>{capabilities.map(item => <Link to={'/capabilities/' + item.slug} key={item.slug}>{item.name}</Link>)}</div><div><span>STUDIO</span><Link to="/work">Work</Link><Link to="/studio">Studio</Link><Link to="/studio#how-we-work">How we work</Link><Link to="/contact">Contact</Link></div></div><div className="b-footer__bottom"><span>© {new Date().getFullYear()} MOREWARD STUDIO</span><span>DIRECTION, MADE VISIBLE.</span><div><Link to="/privacy">PRIVACY</Link><Link to="/terms">TERMS</Link></div></div></footer>
}
