import { useEffect, useRef } from 'react'
import { studioSteps } from './data.js'
import { ConversionLink, RevealWords } from './ui.jsx'

// Studio "How we work": the heading and call to action stay pinned on the left while the steps scroll
// past on the right. Each step's line fills as it crosses the middle of the screen (--p from 0 to 1).
// The artwork is drawn in CSS (process.css), one light sculpture per step.
export function StudioProcess() {
  const ref = useRef(null)
  useEffect(() => {
    const steps = [...(ref.current?.querySelectorAll('.b-process__step') || [])]
    if (!steps.length) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { steps.forEach(step => { step.style.setProperty('--p', 1); step.classList.add('is-active') }); return }
    let frame = 0
    const update = () => {
      frame = 0
      const mid = innerHeight * .55
      steps.forEach(step => {
        const line = step.querySelector('.b-process__body')
        const rect = line.getBoundingClientRect()
        const p = Math.min(1, Math.max(0, (mid - rect.top) / rect.height))
        step.style.setProperty('--p', p.toFixed(3))
        step.classList.toggle('is-active', rect.top < mid && rect.bottom > innerHeight * .2)
      })
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll) }
  }, [])

  return <section id="how-we-work" ref={ref} className="b-process b-panel-dark">
    <div className="b-process__intro">
      <p className="b-process__eyebrow"><span aria-hidden="true"/>How we work<span aria-hidden="true"/></p>
      <RevealWords text="The right work starts with the right conversation." className="b-process__title"/>
      <p className="b-process__lead">Before we talk about deliverables, we want to understand the business, the problem and what a good outcome looks like.</p>
      <ConversionLink location="studio-process" light>Start a project</ConversionLink>
    </div>
    <ol className="b-process__steps">
      {studioSteps.map(([title, body], i) => <li key={title} className={'b-process__step b-process__step--' + (i + 1)}>
        <div className="b-process__text">
          <p className="b-process__tag"><i aria-hidden="true"/><span>Step {String(i + 1).padStart(2, '0')}</span></p>
          <div className="b-process__body">
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        </div>
        <div className="b-process__art" aria-hidden="true"><span className="b-process__glow"/><span className="b-process__form"/><span className="b-process__streak"/></div>
      </li>)}
    </ol>
  </section>
}
