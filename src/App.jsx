import { useEffect, useRef } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouterState } from '@tanstack/react-router'
import { Analytics } from '@vercel/analytics/react'
import { Footer, Header, Loader, Seo } from './baseline/chrome.jsx'
import { HomePage, WorkPage, ProjectPage, CapabilitiesPage, CapabilityPage, ContactPage, LegalPage, NotFoundPage } from './baseline/pages.jsx'

function SiteLayout() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const previous = useRef(null)
  useEffect(() => {
    const first = previous.current === null
    previous.current = pathname
    const frame = requestAnimationFrame(() => {
      const hash = window.location.hash.slice(1)
      if (hash) document.getElementById(decodeURIComponent(hash))?.scrollIntoView({ behavior: first ? 'instant' : 'smooth' })
      else if (!first) window.scrollTo({ top: 0, behavior: 'instant' })
      if (!first) document.querySelector('main h1')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])
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
