import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { projects, studioSteps } from './data.js'
import { Eyebrow, ResponsiveImage } from './ui.jsx'

const services = ['Brand identity', 'Campaigns', 'Outdoor & metro', 'Television & radio', 'Content', 'Websites', 'Custom CRMs', 'AI automations']
const states = ['Brief understood', 'Direction agreed', 'In the making', 'Launched']

// Runs while the element is on screen; reduced motion leaves everything in its final state.
function useInView(ref) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .3 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

function ProcessToast() {
  const ref = useRef(null)
  const inView = useInView(ref)
  const [step, setStep] = useState(states.length - 1)
  useEffect(() => {
    if (!inView || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setStep(0)
    const timer = setInterval(() => setStep(value => (value + 1) % states.length), 1700)
    return () => clearInterval(timer)
  }, [inView])
  const done = step === states.length - 1
  return <div ref={ref} className="b-why__toast-stage" aria-hidden="true">
    <span key={step} className={'b-why__toast' + (done ? ' is-done' : '')}><i>{done ? '✓' : ''}</i>{states[step]}</span>
    {done && <span key={'c' + step} className="b-why__confetti">{Array.from({ length: 14 }, (_, i) => <b key={i} style={{ '--a': i * 25.7 + 'deg', '--d': 40 + (i % 4) * 14 + 'px' }}/>)}</span>}
    <span className="b-why__toast-steps">{states.map((state, i) => <em key={state} className={i <= step ? 'is-on' : ''}/>)}</span>
  </div>
}

export function WhySection({ index }) {
  const [betach, kriya, rucaa] = projects
  return <section id="why-moreward" className="b-why b-panel-light">
    <Eyebrow index={index}>WHY MOREWARD</Eyebrow>
    <h2 className="b-why__title">Why Moreward, and not <span>another studio?</span></h2>
    <div className="b-why__grid">
      <figure className="b-why__tile b-why__tile--image b-why__a" data-reveal>
        <ResponsiveImage image={betach.image} alt={betach.imageAlt} sizes="(max-width: 767px) 100vw, 30vw"/>
        <figcaption>BETACH · Brand identity</figcaption>
      </figure>

      <div className="b-why__tile b-why__b" data-reveal>
        <div className="b-why__ticker" aria-hidden="true"><div>{[...services, ...services].map((service, i) => <span key={i}><i/>{service}</span>)}</div></div>
        <ul className="b-sr-only">{services.map(service => <li key={service}>{service}</li>)}</ul>
        <p className="b-why__caption"><strong>One team.</strong> Brand, media and technology under one roof.</p>
      </div>

      <div className="b-why__tile b-why__c" data-reveal>
        <ProcessToast/>
        <p className="b-why__caption"><strong>A clear process.</strong> {studioSteps.map(([title]) => title).join(', ')}.</p>
      </div>

      <div className="b-why__tile b-why__d" data-reveal>
        <div className="b-why__line-head"><p>Direction,</p><p>made visible.</p></div>
        <div className="b-why__line" aria-hidden="true">
          <svg viewBox="0 0 600 220" preserveAspectRatio="none"><path d="M8 196 L250 190 C318 186 350 170 392 136 C452 88 500 52 592 22"/></svg>
          {studioSteps.map(([title], i) => <span key={title} className="b-why__node" style={{ '--x': [8, 37, 65, 96][i] + '%', '--y': [88, 86, 58, 12][i] + '%' }}><i/><em>{String(i + 1).padStart(2, '0')} {title}</em></span>)}
        </div>
        <p className="b-why__caption"><strong>One line from brief to result.</strong> Strategy, creative, media and technology carry the same idea all the way through.</p>
      </div>

      <figure className="b-why__tile b-why__tile--image b-why__e" data-reveal>
        <ResponsiveImage image={rucaa.image} alt={rucaa.imageAlt} sizes="(max-width: 767px) 100vw, 40vw"/>
        <figcaption>Rucaa · Brand identity</figcaption>
      </figure>

      <Link to="/work" className="b-why__tile b-why__f" data-reveal>
        <span className="b-why__faces" aria-hidden="true">{[betach, kriya, rucaa].map(project => <ResponsiveImage key={project.slug} image={project.image} alt="" sizes="48px"/>)}</span>
        <span className="b-why__f-text"><strong>Brand identities</strong> for BETACH, Kriya Setu and Rucaa</span>
        <span className="b-why__f-cta">SEE THE WORK ↗</span>
      </Link>
    </div>
  </section>
}
