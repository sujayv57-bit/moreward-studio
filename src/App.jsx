import { useEffect, useRef } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouterState } from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { Footer, Header, Loader, Seo } from './baseline/chrome.jsx'
import { HomePage, WorkPage, ProjectPage, CapabilitiesPage, CapabilityPage, ContactPage, LegalPage, NotFoundPage } from './baseline/pages.jsx'

// Scroll memory: each history entry remembers where it was scrolled to, so Back (and Forward) return
// to the same spot, including after a full page load such as a case study page. Entries are keyed by
// the router's own location key (the router renders a new page before it updates window.history).
const SCROLL_KEY = 'moreward-scroll'
const readScroll = () => { try { return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}') } catch { return {} } }
const writeScroll = (key, top) => { try { const all = readScroll(); all[key] = top; sessionStorage.setItem(SCROLL_KEY, JSON.stringify(all)) } catch { /* storage unavailable */ } }
// Re-apply the saved position for a short while: images and reveals can still change the page height.
function restoreScroll(top) {
  const until = performance.now() + 1500
  const step = () => {
    window.scrollTo({ top, behavior: 'instant' })
    if (Math.abs(window.scrollY - top) > 2 && performance.now() < until) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function SiteLayout() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const locationKey = useRouterState({ select: state => (state.location.state?.__TSR_key || state.location.state?.key || 'initial') + '|' + state.location.pathname })
  const previous = useRef(null)
  const currentKey = useRef(null)
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    let frame = 0
    const save = () => { if (currentKey.current) writeScroll(currentKey.current, window.scrollY) }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; save() }) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', save)
    document.addEventListener('click', save, true)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', save); document.removeEventListener('click', save, true) }
  }, [])
  useEffect(() => {
    const first = previous.current === null
    previous.current = locationKey
    currentKey.current = locationKey
    // A new navigation always gets a fresh history key with nothing saved, so a saved position means
    // this entry was visited before: Back, Forward or a reload.
    const saved = readScroll()[locationKey]
    const backForward = typeof saved === 'number'
    const frame = requestAnimationFrame(() => {
      const hash = window.location.hash.slice(1)
      if (backForward) restoreScroll(saved)
      else if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ behavior: first ? 'instant' : 'smooth' })
      else if (!first) window.scrollTo({ top: 0, behavior: 'instant' })
      if (!first && !backForward) document.querySelector('main h1')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [locationKey])
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { document.documentElement.classList.add('site-ready'); return }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target) } }), { threshold: .05, rootMargin: '0px 0px -20px 0px' })
    const frame = requestAnimationFrame(() => document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element)))
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [pathname])
  return <><Seo pathname={pathname}/><a className="b-skip" href="#main">Skip to content</a><Header pathname={pathname}/><main id="main" key={pathname}><Outlet/></main><Footer/><Loader/><SiteAnalytics/></>
}

function SiteAnalytics() {
  if (typeof window === 'undefined' || ['127.0.0.1', 'localhost'].includes(window.location.hostname)) return null
  return <Analytics/>
}

const rootRoute = createRootRoute({ component: SiteLayout, notFoundComponent: NotFoundPage })
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/work', component: WorkPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/work/$slug', component: ProjectPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/capabilities', component: CapabilitiesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/capabilities/$slug', component: CapabilityPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/contact', component: ContactPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/privacy', component: () => <LegalPage type="privacy"/> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/terms', component: () => <LegalPage type="terms"/> }),
]
const routeTree = rootRoute.addChildren(routes)
export const createAppRouter = path => createRouter({ routeTree, defaultPreload: 'intent', ...(path ? { history: createMemoryHistory({ initialEntries: [path] }) } : {}) })
export default function App({ router }) { return <RouterProvider router={router}/> }
