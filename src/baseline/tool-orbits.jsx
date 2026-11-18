import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toolOrbits } from './data.js'
import { Eyebrow, RevealWords } from './ui.jsx'

// Inner and outer orbit radius, as a share of the stage (the SVG uses the same numbers in a 100×100 box).
const RADII = [34, 47]
// Angle of the first logo; the rest follow evenly around the circle.
const START = -105

function Orbit({ orbit, index }) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } }, { threshold: .25 })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  let order = 0
  return <div ref={ref} className={'b-orbit b-orbit--' + (index + 1) + (inView ? ' is-in' : '')}>
    <div className="b-orbit__stage">
      <svg className="b-orbit__rings" viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id={'orbit-ink-' + index} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#07272F"/><stop offset=".55" stopColor="#0B6764"/><stop offset="1" stopColor="#A8E5E2"/></linearGradient></defs>
        <circle className="b-orbit__ring b-orbit__ring--outer" cx="50" cy="50" r={RADII[1]} pathLength="1"/>
        <circle className="b-orbit__ring b-orbit__ring--inner" cx="50" cy="50" r={RADII[0]} pathLength="1" stroke={`url(#orbit-ink-${index})`}/>
      </svg>
      <span className="b-orbit__comet" aria-hidden="true"><i/></span>
      <div className="b-orbit__track" aria-hidden="true">
        {orbit.tools.map((tool, i) => {
          const ring = i % 2, angle = (START + i * 360 / orbit.tools.length) * Math.PI / 180
          const x = 50 + RADII[ring] * Math.cos(angle), y = 50 + RADII[ring] * Math.sin(angle)
          return <span key={tool.name} className={'b-orbit__chip' + (tool.label ? ' b-orbit__chip--label' : '')} style={{ left: x + '%', top: y + '%', '--delay': 500 + i * 110 + 'ms', '--float': (i * 0.7) % 3 + 's' }}>
            <span className="b-orbit__logo" data-name={tool.name}><img src={'/images/tools/' + tool.logo + '.svg'} alt="" loading="lazy" decoding="async" width="28" height="28"/>{tool.label && <small>{tool.label}</small>}</span>
          </span>
        })}
      </div>
      <Link to={'/capabilities/' + orbit.slug} className="b-orbit__core">
        <span className="b-orbit__index">{String(index + 1).padStart(2, '0')}</span>
        <strong>{orbit.name}</strong>
        <span className="b-orbit__line">{orbit.line}</span>
        <span className="b-orbit__more">Explore <span aria-hidden="true">↗</span></span>
      </Link>
    </div>
    <ul className="b-sr-only" aria-label={'Tools for ' + orbit.name}>{orbit.tools.map(tool => <li key={tool.name}>{tool.name}</li>)}</ul>
  </div>
}

export function ToolOrbits() {
  return <section id="tools" className="b-orbits b-panel-light">
    <div className="b-orbits__head">
      <Eyebrow>Tools we work in</Eyebrow>
      <RevealWords text="The stack behind the work." className="b-orbits__title"/>
      <p>Each discipline runs on the tools that suit it best, so the work moves from idea to launch without starting over.</p>
    </div>
    <div className="b-orbits__grid">{toolOrbits.map((orbit, i) => <Orbit key={orbit.slug} orbit={orbit} index={i}/>)}</div>
  </section>
}
