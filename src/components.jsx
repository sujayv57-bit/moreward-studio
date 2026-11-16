import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Arrow, SectionLabel } from './sections.jsx'
import wordmarkImage from '../brand-kit/01-logos/wordmark-ink.png'
import whiteWordmark from '../brand-kit/01-logos/wordmark-white.png'

const navigation = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Projects', to: '/projects' },
  { label: 'Services', href: '/#services' },
  { label: 'Process', href: '/#process' },
]

const visitorTime = () => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date())

export function Seo({ title, description }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | Moreward Studio` : 'Moreward Studio | Growth & Customer Acquisition'
    document.title = fullTitle
    const setMeta = (selector, attribute, value) => {
      let tag = document.head.querySelector(selector)
      if (!tag) {
        tag = document.createElement('meta')
        const [key, name] = attribute
        tag.setAttribute(key, name)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', value)
    }
    setMeta('meta[name="description"]', ['name', 'description'], description)
    setMeta('meta[property="og:title"]', ['property', 'og:title'], fullTitle)
    setMeta('meta[property="og:description"]', ['property', 'og:description'], description)
    setMeta('meta[name="twitter:title"]', ['name', 'twitter:title'], fullTitle)
    setMeta('meta[name="twitter:description"]', ['name', 'twitter:description'], description)
  }, [title, description])
  return null
}

export function Navigation({ pathname }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(visitorTime)
  const menuRef = useRef(null)
  const toggleRef = useRef(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      const darkPanels = document.querySelectorAll('.mw-work__frame,.mw-capabilities__frame,.mw-process__sticky,.ref-about-belief__panel,.footer')
      setScrolled([...darkPanels].some(node => { const rect = node.getBoundingClientRect(); return rect.top < 75 && rect.bottom > 75 }))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])

  useEffect(() => { const timer = window.setInterval(() => setTime(visitorTime()), 30000); return () => window.clearInterval(timer) }, [])

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  useEffect(() => {
    document.body.classList.toggle('menu-open', open)
    const background = [document.querySelector('main'), document.querySelector('footer')]
    background.forEach(node => { if (node) node.inert = open })
    if (open) menuRef.current?.querySelector('a')?.focus()
    else if (wasOpen.current && document.activeElement?.closest('#mobile-menu')) toggleRef.current?.focus()
    wasOpen.current = open
    const onKey = event => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab' || !open) return
      const controls = [toggleRef.current, ...menuRef.current.querySelectorAll('a')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('menu-open')
      background.forEach(node => { if (node) node.inert = false })
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = to => to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)
  const navLink = (item, index, mobile = false) => item.href
    ? <a key={item.label} href={item.href} tabIndex={mobile && !open ? -1 : 0} onClick={() => setOpen(false)}>{mobile && <small>0{index + 1}</small>}{item.label}{mobile && <Arrow diagonal />}</a>
    : <Link key={item.label} to={item.to} tabIndex={mobile && !open ? -1 : 0} className={!mobile && active(item.to) ? 'is-active' : ''} aria-current={active(item.to) ? 'page' : undefined} onClick={() => setOpen(false)}>{mobile && <small>0{index + 1}</small>}{item.label}{mobile && <Arrow diagonal />}</Link>
  return <>
    <header className={`site-header ${scrolled || open ? 'site-header--solid' : ''}`}>
      <div className="mw-nav-shell">
        <Link className="wordmark" to="/" tabIndex={open ? -1 : 0} onClick={() => setOpen(false)}><img src={wordmarkImage} alt="Moreward Studio" /></Link>
        <div className="mw-nav-message" aria-hidden="true"><span>MORE IMPACT. MORE FORWARD. &nbsp; / &nbsp; IDEAS THAT MOVE BUSINESS. &nbsp; / &nbsp; MORE IMPACT. MORE FORWARD.</span></div>
        <time className="mw-nav-time">{time} ◷</time>
        <nav className="desktop-nav" aria-label="Primary navigation">{navigation.map((item,index) => navLink(item,index))}</nav>
        <Link className="header-cta" to="/contact">Contact</Link>
        <button ref={toggleRef} className={`menu-toggle ${open ? 'is-open' : ''}`} type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}><span></span><span></span></button>
      </div>
    </header>
    <div ref={menuRef} id="mobile-menu" className={`mobile-menu ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <nav aria-label="Mobile navigation">{navigation.map((item, index) => navLink(item,index,true))}<Link to="/contact" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}><small>06</small>Contact<Arrow diagonal /></Link></nav>
      <p>More impact. More forward.</p>
    </div>
  </>
}

export function PageHero({ number, eyebrow, title, description, tone = 'dark', aside }) {
  return <section className={`page-hero page-hero--${tone}`}>
    <div className="container page-hero__inner">
      <SectionLabel number={number}>{eyebrow}</SectionLabel>
      <div className="page-hero__copy"><h1>{title}</h1><p>{description}</p></div>
      <div className="page-hero__aside" aria-hidden="true"><span>MOREWARD STUDIO / {number}</span><div>{aside || 'M↗'}</div><span>GROWTH BY DESIGN</span></div>
    </div>
  </section>
}

export function FinalCTA({ title = <>Let's move<br/><em>something forward.</em></>, copy = 'Tell us what the next stage of growth needs to achieve.' }) {
  return <section className="final-cta"><div className="container final-cta__inner"><SectionLabel number="↗">NEXT MOVE</SectionLabel><h2>{title}</h2><div className="final-cta__bottom"><p>{copy}</p><Link to="/contact" className="button"><span>Start a project</span><Arrow diagonal /></Link></div></div></section>
}

export function Footer() {
  return <footer className="footer mw-footer"><div className="mw-footer__inner"><div className="mw-footer__top"><span>CREATIVE THINKING AND USEFUL SYSTEMS, MOVING BUSINESS FORWARD.</span><Link to="/contact">START A PROJECT <Arrow diagonal /></Link></div><Link className="mw-footer__brand" to="/"><img src={whiteWordmark} alt="Moreward Studio" loading="lazy" /></Link><div className="mw-footer__links"><nav aria-label="Footer navigation">{navigation.map((item,index) => item.href ? <a key={index} href={item.href}>{item.label} <Arrow diagonal /></a> : <Link key={index} to={item.to}>{item.label} <Arrow diagonal /></Link>)}<Link to="/contact">Contact <Arrow diagonal /></Link></nav><div className="mw-footer__social" aria-label="Social profiles pending"><span>LinkedIn</span><span>Instagram</span><span>YouTube</span></div></div><div className="mw-footer__legal"><span>© {new Date().getFullYear()} Moreward Studio. All rights reserved.</span><span><Link to="/privacy">Privacy</Link> &nbsp; / &nbsp; <Link to="/terms">Terms</Link></span></div></div></footer>
}
