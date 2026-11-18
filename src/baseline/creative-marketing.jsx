import { useEffect, useRef, useState } from 'react'
import { creativeMarketing as copy } from './data.js'
import { Breadcrumb, ConversionLink, Eyebrow, RevealWords } from './ui.jsx'

const CONTACT = '/contact?service=creative-marketing'
const two = n => String(n).padStart(2, '0')

// Sections fade up as they enter the viewport. The hidden start state only applies once this script has
// run (html.cm-motion), so the page is fully readable without JavaScript or with reduced motion.
function useSectionReveal(root) {
  useEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const items = [...el.querySelectorAll('[data-cm]')]
    const vh = innerHeight
    items.forEach(item => { if (item.getBoundingClientRect().top > vh * .92) item.classList.add('cm-pending') })
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.remove('cm-pending'); observer.unobserve(entry.target) }
    }), { rootMargin: '0px 0px -8% 0px' })
    items.forEach(item => item.classList.contains('cm-pending') && observer.observe(item))
    return () => { observer.disconnect(); items.forEach(item => item.classList.remove('cm-pending')) }
  }, [root])
}

// Desktop service index: marks the service currently crossing the middle of the screen.
function useActiveService(ids) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id) }), { rootMargin: '-45% 0px -50% 0px' })
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [ids])
  return active
}

const serviceIds = copy.services.map(service => service.id)

export function CreativeMarketingPage() {
  const root = useRef(null)
  useSectionReveal(root)
  const active = useActiveService(serviceIds)
  const { hero, view, services, steps, engage, close } = copy
  return <div ref={root} className="b-cm">
    <section className="b-cm-hero b-panel-dark">
      <div className="b-cm-hero__glow" aria-hidden="true"/>
      <div className="b-cm-hero__inner">
        <Breadcrumb parent="Capabilities" parentTo="/capabilities" current={hero.eyebrow}/>
        <div className="b-cm-hero__enter" style={{ '--i': 0 }}><Eyebrow light>{hero.eyebrow}</Eyebrow></div>
        <RevealWords as="h1" text={hero.title} className="b-cm-hero__title"/>
        <div className="b-cm-hero__copy">
          <p className="b-cm-hero__body b-cm-hero__enter" style={{ '--i': 2 }}>{hero.body}</p>
          <p className="b-cm-hero__support b-cm-hero__enter" style={{ '--i': 3 }}>{hero.support}</p>
          <div className="b-cm-hero__actions b-cm-hero__enter" style={{ '--i': 4 }}>
            <a href="#services" className="b-cm-link b-cm-link--light">Explore the services <span aria-hidden="true">↓</span></a>
            <ConversionLink to={CONTACT} service="creative-marketing" location="creative-marketing-hero" light>Start a project</ConversionLink>
          </div>
        </div>
      </div>
    </section>

    <section className="b-cm-view b-panel-light" aria-labelledby="cm-view-title">
      <h2 id="cm-view-title" className="b-cm-view__title" data-cm>{view.lead} <span>{view.follow}</span></h2>
      <div className="b-cm-view__aside" data-cm>
        <ol className="b-cm-view__chain" aria-hidden="true">{['Strategy', 'Identity', 'Advertising', 'Campaigns', 'Creators', 'Content'].map(word => <li key={word}>{word}</li>)}</ol>
        <p>{view.body}</p>
      </div>
    </section>

    <section id="services" className="b-cm-services b-panel-light" aria-labelledby="cm-services-title">
      <div className="b-cm-services__head" data-cm>
        <Eyebrow>The services</Eyebrow>
        <h2 id="cm-services-title">Six services, one direction.</h2>
        <p>Each can stand on its own or work with the others. The scope lists show what a project can include, not fixed packages; every project is scoped around what it needs.</p>
      </div>
      <div className="b-cm-services__layout">
        <nav className="b-cm-index" aria-label="Creative & Marketing services">
          <ol>{services.map((service, i) => <li key={service.id}><a href={'#' + service.id} aria-current={active === service.id ? 'true' : undefined} className={active === service.id ? 'is-active' : ''}><span>{two(i + 1)}</span>{service.name}</a></li>)}</ol>
        </nav>
        <div className="b-cm-services__list">
          {services.map((service, i) => <article key={service.id} id={service.id} className="b-cm-service" aria-labelledby={service.id + '-title'} data-cm>
            <p className="b-cm-service__number">{two(i + 1)} <span>/ 06</span></p>
            <div className="b-cm-service__main">
              <h3 id={service.id + '-title'}>{service.name}</h3>
              <p>{service.body}</p>
            </div>
            <div className="b-cm-service__scope">
              <h4>A scope can include</h4>
              <ul>{service.scope.map(item => <li key={item}>{item}</li>)}</ul>
              {service.note && <p>{service.note}</p>}
            </div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="b-cm-flow b-panel-dark" aria-labelledby="cm-flow-title">
      <div className="b-cm-flow__head" data-cm>
        <Eyebrow light>How the work moves</Eyebrow>
        <h2 id="cm-flow-title">From brief to usable work.</h2>
      </div>
      <ol className="b-cm-flow__steps" data-cm>{steps.map(([title, body], i) => <li key={title} style={{ '--i': i }}><span className="b-cm-flow__dot" aria-hidden="true"/><span className="b-cm-flow__num">{two(i + 1)}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
    </section>

    <section className="b-cm-engage b-panel-light" aria-labelledby="cm-engage-title">
      <div className="b-cm-engage__head" data-cm>
        <Eyebrow>Ways to engage</Eyebrow>
        <h2 id="cm-engage-title">{engage.title}</h2>
        <p>{engage.body}</p>
      </div>
      <ul className="b-cm-engage__options" data-cm>{engage.options.map(([title, body], i) => <li key={title}><span>{two(i + 1)}</span><h3>{title}</h3><p>{body}</p></li>)}</ul>
    </section>

    <section className="b-cm-close b-panel-dark" aria-labelledby="cm-close-title">
      <div data-cm>
        <Eyebrow light>{close.eyebrow}</Eyebrow>
        <h2 id="cm-close-title">{close.title}</h2>
      </div>
      <div className="b-cm-close__aside" data-cm>
        <p>{close.body}</p>
        <ConversionLink to={CONTACT} service="creative-marketing" location="creative-marketing-close" light>{close.button}</ConversionLink>
      </div>
    </section>
  </div>
}
