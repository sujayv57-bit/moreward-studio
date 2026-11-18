import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toolOrbits } from './data.js'
import { Eyebrow, RevealWords } from './ui.jsx'

// Orbit radius for each capability, innermost first, as a share of the stage (the SVG uses the same
// numbers in a 100×100 box). Each orbit's first logo starts at a different angle so they never line up.
const RADII = [21, 34.5, 47.5]
const START = [-90, -54, -112]

// A small solar system: the logomark at the centre, one orbit per capability. Picking a capability
// in the list (hover or focus) brings its orbit forward and quietens the others.
export function ToolOrbits() {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  const [active, setActive] = useState(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } }, { threshold: .2 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  let order = 0
  return <section id="tools" className="b-orbits b-panel-light">
    <div className="b-orbits__layout">
      <div className="b-orbits__copy">
        <Eyebrow>Tools we work in</Eyebrow>
        <RevealWords text="The stack behind the work." className="b-orbits__title"/>
        <p>Each discipline runs on the tools that suit it best, so the work moves from idea to launch without starting over.</p>
        <ol className="b-orbits__legend">
          {toolOrbits.map((orbit, i) => <li key={orbit.slug} className={active === i ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
            <Link to={'/capabilities/' + orbit.slug}>
              <svg className="b-orbits__ring-key" viewBox="0 0 36 36" aria-hidden="true">{[6, 11, 16.5].map((r, ring) => <circle key={r} cx="18" cy="18" r={r} className={ring === i ? 'is-this' : ''}/>)}<circle cx="18" cy="18" r="2.4" className="b-orbits__ring-sun"/></svg>
              <span><strong>{orbit.name}</strong><small>{orbit.tools.map(tool => tool.name).join(', ')}</small></span>
              <span className="b-orbits__go" aria-hidden="true">↗</span>
            </Link>
          </li>)}
        </ol>
      </div>
      <div ref={ref} className={'b-system' + (inView ? ' is-in' : '') + (active !== null ? ' has-active' : '')} data-active={active ?? ''} aria-hidden="true">
        <div className="b-system__stage">
          <svg className="b-system__rings" viewBox="0 0 100 100">
            {RADII.map((r, i) => <circle key={r} className={'b-system__ring b-system__ring--' + (i + 1)} cx="50" cy="50" r={r} pathLength="1"/>)}
          </svg>
          {[0, 1, 2].map(n => <span key={n} className="b-system__ripple" style={{ animationDelay: n * 1.6 + 's' }}/>)}
          <div className="b-system__sun"><img src="/images/logomark.svg" alt="" width="64" height="64"/></div>
          {toolOrbits.map((orbit, ring) => <div key={orbit.slug} className={'b-system__orbit b-system__orbit--' + (ring + 1)}>
            <span className="b-system__comet"><i style={{ top: 50 - RADII[ring] + '%' }}/></span>
            {orbit.tools.map((tool, i) => {
              const angle = (START[ring] + i * 360 / orbit.tools.length) * Math.PI / 180
              return <span key={tool.name} className="b-system__chip" style={{ left: 50 + RADII[ring] * Math.cos(angle) + '%', top: 50 + RADII[ring] * Math.sin(angle) + '%', '--delay': 700 + ring * 350 + i * 90 + 'ms', '--float': (order++ * .65) % 3 + 's' }}>
                <span className="b-system__logo" data-name={tool.name}><img src={'/images/tools/' + tool.logo + '.svg'} alt="" loading="lazy" decoding="async" width="28" height="28"/></span>
              </span>
            })}
          </div>)}
        </div>
      </div>
    </div>
  </section>
}
