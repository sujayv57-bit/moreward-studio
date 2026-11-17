import { useEffect, useRef } from 'react'
import { ContactForm } from './contact-form.jsx'
import { Eyebrow, RevealWords } from './ui.jsx'
import { contactHands } from './data.js'

// Home contact section. Two hands reach in from the edges and close the gap as the section scrolls
// into view (scroll position drives --reach from 0 to 1). With reduced motion they sit at the end state.
// Artwork: set `contactHands` in data.js to two images (left hand, right hand, transparent or white
// background). Until then a fine-line stand-in with the same motion is shown.
export function HomeContact() {
  const ref = useRef(null)
  useEffect(() => {
    const section = ref.current
    if (!section) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { section.style.setProperty('--reach', 1); return }
    let frame = 0
    const update = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the section's top meets the bottom of the screen, 1 once it reaches 15% from the top.
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.85)))
      section.style.setProperty('--reach', progress.toFixed(3))
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])

  return <section ref={ref} id="contact" className="b-home-contact b-panel-light" aria-label="Contact">
    <div className="b-home-contact__hands" aria-hidden="true">
      {contactHands
        ? <><img className="b-home-contact__hand b-home-contact__hand--left" src={contactHands.left} alt="" loading="lazy" decoding="async"/><img className="b-home-contact__hand b-home-contact__hand--right" src={contactHands.right} alt="" loading="lazy" decoding="async"/></>
        : <><span className="b-home-contact__reach b-home-contact__reach--left"/><span className="b-home-contact__reach b-home-contact__reach--right"/><span className="b-home-contact__spark"/></>}
    </div>
    <div className="b-home-contact__intro">
      <Eyebrow>Start a project</Eyebrow>
      <RevealWords text="Let's give it direction." className="b-home-contact__title"/>
      <p>Bring us the problem. We'll help shape what happens next.</p>
    </div>
    <div className="b-home-contact__form"><ContactForm/></div>
  </section>
}
