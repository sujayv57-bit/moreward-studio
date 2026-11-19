import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities, navigation } from './data.js'
import { seo, SOCIAL, STUDIO_EMAIL } from '../config/site.js'
import { schemaFor } from '../config/schema.js'
import { ConversionLink, EmailLink, SocialIcon } from './ui.jsx'
const logoInk = '/images/logo-ink.svg'
const logoWhite = '/images/logo-white.svg'

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
  return <div className={'b-loader' + (leaving ? ' b-loader--leaving' : '')} role="status" aria-label="Loading Moreward"><div><img className="b-loader__mark" src="/images/logomark-white.svg" alt="Moreward" width="96" height="96"/><div className="b-loader__track"><span/></div><p>Direction, made visible.</p></div></div>
}

export function Header({ pathname }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // Pages that open on a dark hero. Used before the page is measured and whenever nothing is behind the header.
  const startsDark = path => path === '/' || path === '/work' || path.startsWith('/work/') || path.startsWith('/capabilities/')
  const [overDark, setOverDark] = useState(startsDark(pathname))
  const [hidden, setHidden] = useState(false)
  const toggleRef = useRef(null), menuRef = useRef(null), headerRef = useRef(null)
  useEffect(() => {
    let previous = window.scrollY
    const onScroll = () => {
      const current = window.scrollY
      setScrolled(current > 50)
      const crossing = [...document.querySelectorAll('main>section,main>div>section')].find(section => { const rect = section.getBoundingClientRect(); return rect.top <= 65 && rect.bottom >= 65 })
      setOverDark(crossing ? crossing.matches('.b-panel-dark,.m-hero') : (current < 80 && startsDark(pathname)))
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !open && !headerRef.current?.contains(document.activeElement)) setHidden(current > previous && current > 160 && current - previous > 2)
      else setHidden(false)
      previous = current
    }
    // Measure again once layout settles (fonts, images, the loader), not only on the first frame.
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll); window.addEventListener('load', onScroll)
    const timers = [requestAnimationFrame(onScroll), setTimeout(onScroll, 400), setTimeout(onScroll, 1600)]
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); window.removeEventListener('load', onScroll); cancelAnimationFrame(timers[0]); clearTimeout(timers[1]); clearTimeout(timers[2]) }
  }, [open, pathname])
  useEffect(() => { setOpen(false); setHidden(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const main = document.querySelector('main'), footer = document.querySelector('footer')
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
  const current = path => pathname === path || pathname.startsWith(path + '/')
  const close = () => { setOpen(false); toggleRef.current?.focus() }
  return <><header ref={headerRef} className={'b-header' + (dark ? ' b-header--over' : ' b-header--light') + (scrolled ? ' b-header--scrolled' : '') + (dark && scrolled ? ' b-header--dark-surface' : '') + (hidden ? ' b-header--hidden' : '')} onFocusCapture={() => setHidden(false)}><Link className="b-header__logo" to="/" aria-label="Moreward home"><img src={dark ? logoWhite : logoInk} alt="Moreward Studio"/></Link><nav className="b-header__left" aria-label="Primary">{navigation.slice(0, 3).map(item => <Link key={item.to} to={item.to} aria-current={current(item.to) ? 'page' : undefined} className={current(item.to) ? 'is-current' : ''}>{item.label}</Link>)}</nav><div className="b-header__right"><ConversionLink location="header" active={pathname === '/contact'} className="b-header__cta"/><button ref={toggleRef} className="b-menu-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="b-menu" onClick={() => setOpen(!open)}><span/><span/></button></div></header>
    <div ref={menuRef} id="b-menu" className={'b-menu' + (open ? ' b-menu--open' : '')} aria-hidden={!open}><div className="b-menu__top"><Link to="/" tabIndex={open ? 0 : -1} onClick={close}><img src={logoWhite} alt="Moreward Studio"/></Link><button aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={close}>×</button></div><nav aria-label="Full navigation">{navigation.map((item, i) => <Link key={item.to} to={item.to} tabIndex={open ? 0 : -1} onClick={close}>{item.label}</Link>)}</nav><div className="b-menu__secondary">{capabilities.map(item => <Link key={item.slug} to={'/capabilities/' + item.slug} tabIndex={open ? 0 : -1} onClick={close}>{item.name}</Link>)}</div><div className="b-menu__bottom"><EmailLink>{STUDIO_EMAIL}</EmailLink><div className="b-menu__social">{SOCIAL.map(item => <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1}>{item.name}</a>)}</div></div></div></>
}


// Footer: a bento of light cards. Left: a project prompt, then the site map. Right: the brand card,
// then a tile for each social profile (SOCIAL in config/site.js).
export function Footer() {
  return <footer className="b-foot">
    <div className="b-foot__card b-foot__prompt">
      <h2>Have a project in mind?</h2>
      <div className="b-foot__prompt-row"><EmailLink className="b-foot__field">{STUDIO_EMAIL}</EmailLink><ConversionLink location="footer" className="b-foot__button">Start a project</ConversionLink></div>
    </div>
    <nav className="b-foot__card b-foot__map" aria-label="Footer">
      <h2>Everything across our studio, work and services.</h2>
      <div className="b-foot__cols">
        <div><h3>Menu</h3><Link to="/">Home</Link><Link to="/work">Work</Link><Link to="/capabilities">Capabilities</Link><Link to="/contact">Contact</Link></div>
        <div><h3>Capabilities</h3>{capabilities.map(item => <Link key={item.slug} to={'/capabilities/' + item.slug}>{item.name}</Link>)}</div>
        <div><h3>Information</h3><Link to="/capabilities" hash="studio">About the studio</Link><Link to="/capabilities" hash="how-we-work">How we work</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
      </div>
    </nav>
    <div className="b-foot__card b-foot__brand">
      <div className="b-foot__lockup">
        <Link to="/" className="b-foot__mark" aria-label="Moreward home"><img src={logoInk} alt="Moreward Studio"/></Link>
        <p className="b-foot__line"><span aria-hidden="true"/>Direction, made visible.</p>
      </div>
      <p className="b-foot__about">Moreward is an independent studio for creative, advertising and technology work: brand, campaigns, media and the systems behind them.</p>
      <div className="b-foot__legal"><span>© {new Date().getFullYear()} Moreward Studio. All rights reserved.</span></div>
    </div>
    <div className="b-foot__tiles">
      {SOCIAL.map(item => <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="b-foot__card b-foot__tile" aria-label={item.name + ' (opens in a new tab)'}><i><SocialIcon name={item.name}/></i><span>{item.name}</span></a>)}
    </div>
  </footer>
}
