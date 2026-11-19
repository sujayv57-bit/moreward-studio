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
  const played = useRef(false)
  // Plays through the four states once, the first time the tile is on screen, then rests on "Launched".
  useEffect(() => {
    if (!inView || played.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    played.current = true
    setStep(0)
    const timer = setInterval(() => setStep(value => {
      const next = Math.min(value + 1, states.length - 1)
      if (next === states.length - 1) clearInterval(timer)
      return next
    }), 1700)
    return () => clearInterval(timer)
  }, [inView])
  const done = step === states.length - 1
  return <div ref={ref} className="b-why__toast-stage" aria-hidden="true">
    <span key={step} className={'b-why__toast' + (done ? ' is-done' : '')}><i>{done ? '✓' : ''}</i>{states[step]}</span>
    {done && <span key={'c' + step} className="b-why__confetti">{Array.from({ length: 14 }, (_, i) => <b key={i} style={{ '--a': i * 25.7 + 'deg', '--d': 40 + (i % 4) * 14 + 'px' }}/>)}</span>}
    <span className="b-why__toast-steps">{states.map((state, i) => <em key={state} className={i <= step ? 'is-on' : ''}/>)}</span>
  </div>
}

// Stage points in the SVG's 600×220 box. The curve is a Catmull-Rom spline through exactly these points,
// and the SVG stretches without keeping its aspect, so x/600 and y/220 as percentages land on the line.
const W = 600, H = 220
const linePoints = [[18, 196], [214, 184], [404, 118], [582, 26]]
const linePath = (() => {
  const p = [linePoints[0], ...linePoints, linePoints[linePoints.length - 1]]
  let d = `M${p[1][0]} ${p[1][1]}`
  for (let i = 1; i < p.length - 2; i++) {
    const c1 = [p[i][0] + (p[i + 1][0] - p[i - 1][0]) / 6, p[i][1] + (p[i + 1][1] - p[i - 1][1]) / 6]
    const c2 = [p[i + 1][0] - (p[i + 2][0] - p[i][0]) / 6, p[i + 1][1] - (p[i + 2][1] - p[i][1]) / 6]
    d += ` C${c1.map(n => n.toFixed(1)).join(' ')} ${c2.map(n => n.toFixed(1)).join(' ')} ${p[i + 1][0]} ${p[i + 1][1]}`
  }
  return d
})()

// A pulse runs along the line on a loop while it is on screen; each stage lights up as the pulse reaches it.
function DirectionLine() {
  const ref = useRef(null)
  const pathRef = useRef(null)
  const pulseRef = useRef(null)
  const done = useRef(false)
  const inView = useInView(ref)
  useEffect(() => {
    const root = ref.current, path = pathRef.current, pulse = pulseRef.current
    if (!inView || done.current || !root || !path || !pulse || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const nodes = [...root.querySelectorAll('.b-why__node')]
    const length = path.getTotalLength()
    const RUN = 4200, FADE = 600, START = 1800
    let frame = 0, start = 0
    // One pass along the line the first time it is on screen; afterwards the line stays filled and lit.
    const tick = now => {
      if (!start) start = now
      const elapsed = now - start - START
      const t = Math.min(1, Math.max(0, elapsed / RUN))
      const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const point = path.getPointAtLength(eased * length)
      pulse.style.left = point.x / W * 100 + '%'
      pulse.style.top = point.y / H * 100 + '%'
      pulse.style.opacity = elapsed < 0 ? 0 : t >= 1 ? Math.max(0, 1 - (elapsed - RUN) / FADE) : 1
      root.style.setProperty('--done', (elapsed < 0 ? 0 : point.x / W * 100) + '%')
      nodes.forEach((node, i) => node.classList.toggle('is-lit', elapsed >= 0 && point.x >= linePoints[i][0] - 1))
      if (elapsed < RUN + FADE) frame = requestAnimationFrame(tick)
      else done.current = true
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); if (!done.current) { root.style.removeProperty('--done'); nodes.forEach(node => node.classList.remove('is-lit')) } }
  }, [inView])
  return <div ref={ref} className="b-why__line" aria-hidden="true">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"><path ref={pathRef} className="b-why__line-track" d={linePath}/></svg>
    <svg className="b-why__line-done" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"><path d={linePath}/></svg>
    {studioSteps.map(([title], i) => <span key={title} className={'b-why__node b-why__node--' + (i + 1)} style={{ '--x': linePoints[i][0] / W * 100 + '%', '--y': linePoints[i][1] / H * 100 + '%' }}><i/><em>{String(i + 1).padStart(2, '0')} {title}</em></span>)}
    <b ref={pulseRef} className="b-why__pulse"/>
  </div>
}

export function WhySection({ index }) {
  const [betach, kriya, rucaa] = projects
  return <section id="why-moreward" className="b-why b-panel-light">
    <Eyebrow index={index}>Why Moreward</Eyebrow>
    <h2 className="b-why__title">Why Moreward, and not <span>another studio?</span></h2>
    <div className="b-why__grid">
      <Link to="/work" className="b-why__tile b-why__tile--image b-why__a" data-reveal aria-label="BETACH brand identity and website, see the work">
        <ResponsiveImage image={betach.image} alt={betach.imageAlt} sizes="(max-width: 767px) 100vw, 30vw"/>
        <span className="b-why__tag">BETACH · Identity & website</span>
      </Link>

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
        <DirectionLine/>
        <p className="b-why__caption"><strong>One line from brief to result.</strong> Strategy, creative, media and technology carry the same idea all the way through.</p>
      </div>

      <Link to="/work" className="b-why__tile b-why__tile--image b-why__e" data-reveal aria-label="Rucaa brand identity, see the work">
        <ResponsiveImage image={rucaa.image} alt={rucaa.imageAlt} sizes="(max-width: 767px) 100vw, 40vw"/>
        <span className="b-why__tag">Rucaa · Brand identity</span>
      </Link>

      <Link to="/work" className="b-why__tile b-why__f" data-reveal>
        <span className="b-why__faces" aria-hidden="true">{[betach, kriya, rucaa].map(project => <ResponsiveImage key={project.slug} image={project.image} alt="" sizes="48px"/>)}</span>
        <span className="b-why__f-text"><strong>Brand identities</strong> for BETACH, Kriya Setu and Rucaa</span>
        <span className="b-why__f-cta">See the work ↗</span>
      </Link>
    </div>
  </section>
}
