import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities, industries, method, projects } from './brand.js'
import { HeroDiagram } from './sections.jsx'

export const Arrow = () => <span aria-hidden="true" className="studio-arrow">↗</span>
export const Label = ({ children, index }) => <div className="studio-label"><span>{index}</span>{children}</div>
export const Action = ({ to, children, outline = false }) => <Link to={to} className={`studio-action${outline ? ' studio-action--outline' : ''}`}><span>{children}</span><Arrow /></Link>

export function StudioHero() {
  return <section className="studio-hero" id="top"><div className="studio-wrap studio-hero__layout">
    <div className="studio-hero__copy"><Label index="M / 01">MOREWARD STUDIO</Label><h1>More impact.<br/>More <em>forward.</em></h1><p>We help ambitious businesses get discovered, acquire the right customers, and grow through strategy, creativity, technology, media, and systems.</p><div className="studio-actions"><Action to="/contact">Start a project</Action><Action to="/work" outline>View work</Action></div></div>
    <div className="studio-hero__visual"><div className="studio-hero__visual-note"><span>A CONNECTED PRACTICE</span><span>01—06</span></div><HeroDiagram /><div className="studio-hero__visual-foot">FROM FIRST IMPRESSION <span>TO BUSINESS MOMENTUM</span></div></div>
  </div><div className="studio-wrap studio-hero__base"><span>INDEPENDENT BY DESIGN</span><span>SCROLL TO EXPLORE ↓</span></div></section>
}

export function PointOfView() {
  return <section className="studio-point studio-section" id="point-of-view"><div className="studio-wrap"><Label index="01 / 08">POINT OF VIEW</Label><div className="studio-point__grid"><h2>Marketing should<br/>move the <em>business.</em></h2><div><p className="studio-lead">We don't just create marketing. We build systems that generate and convert demand.</p><p>Strategy gives the work direction. Brand and creative make it matter. Media and acquisition bring it to people. Digital experiences and business systems turn that attention into something lasting.</p><div className="studio-point__signoff">MORE + FORWARD <span>↗</span></div></div></div></div></section>
}

export function CapabilitiesFeature({ full = false }) {
  const [active, setActive] = useState(0)
  const item = capabilities[active]
  return <section className="studio-capabilities studio-section" id="capabilities"><div className="studio-wrap"><div className="studio-section-head"><Label index="02 / 08">SIX CAPABILITIES</Label><h2>One connected<br/><em>practice.</em></h2><p>Distinct disciplines. A shared ambition: work that makes a meaningful difference to the business.</p></div><div className="studio-capabilities__layout"><div className="studio-capabilities__list">{capabilities.map((capability, i) => <div className="studio-capabilities__entry" key={capability.slug}><button className={`studio-capability${active === i ? ' is-active' : ''}`} type="button" onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} aria-expanded={active === i} aria-controls={`capability-panel-${i}`}><span>0{i + 1}</span><strong>{capability.name}</strong><Arrow /></button><div id={`capability-panel-${i}`} className={`studio-capability__mobile${active === i ? ' is-active' : ''}`} hidden={active !== i}><p>{capability.line}</p><Link to="/capabilities/$slug" params={{ slug: capability.slug }}>Explore capability <Arrow /></Link></div></div>)}</div><div className="studio-capabilities__stage" aria-live="polite"><div className="studio-capabilities__stage-top"><span>MOREWARD / 0{active + 1}</span><span>CAPABILITY</span></div><div className="studio-capabilities__glyph" aria-hidden="true">{item.mark}</div><div className="studio-capabilities__stage-bottom"><h3>{item.line}</h3><Link to="/capabilities/$slug" params={{ slug: item.slug }}>Explore {item.name} <Arrow /></Link></div></div></div>{!full && <div className="studio-section-tail"><Action to="/capabilities" outline>All capabilities</Action></div>}</div></section>
}

export function MethodFeature() {
  return <section className="studio-method studio-section" id="method"><div className="studio-wrap"><div className="studio-section-head"><Label index="03 / 08">HOW MOREWARD WORKS</Label><h2>Connected from<br/>the <em>first move.</em></h2><p>The work changes shape. The thinking stays connected from understanding to scale.</p></div><div className="studio-method__flow">{method.map(([name, detail], i) => <article className="studio-method__step" key={name} data-reveal><span>0{i + 1} / 06</span><h3>{name}</h3><p>{detail}</p></article>)}</div><p className="studio-method__line">UNDERSTAND <span>━━━━━━━━━━━━━━━━━━━━━━━━━━</span> SCALE</p></div></section>
}

export function ProjectArt({ visual, number }) {
  return <div className={`studio-project-art studio-project-art--${visual}`} aria-hidden="true"><span className="studio-project-art__top">MOREWARD STUDY / {number}</span>{visual === 'identity' ? <div className="studio-project-art__identity"><span>THE<br/>REASON<br/>TO <i>CHOOSE.</i></span><b>↗</b></div> : visual === 'movement' ? <div className="studio-project-art__movement"><span>ATTENTION</span><div className="studio-project-art__track"><i></i><i></i><i></i></div><span>ACTION</span></div> : <div className="studio-project-art__system"><span>SIGNAL</span><span>DECISION</span><span>MOVEMENT</span></div>}<span className="studio-project-art__bottom">CONCEPT DIRECTION — NOT CLIENT WORK</span></div>
}

export function WorkFeature({ all = false }) {
  const items = all ? projects : projects.slice(0, 2)
  return <section className="studio-work studio-section" id="work"><div className="studio-wrap"><div className="studio-section-head"><Label index="04 / 08">SELECTED WORK</Label><h2>Thinking made<br/><em>visible.</em></h2><p>Selected concept directions that show how we approach a brand, a journey, and a system.</p></div><p className="studio-disclosure">Illustrative studies. No client engagement or result is implied.</p><div className="studio-work__grid">{items.map((project, i) => <Link className={`studio-project studio-project--${i + 1}`} key={project.slug} to="/work/$slug" params={{ slug: project.slug }}><ProjectArt visual={project.visual} number={project.number} /><div className="studio-project__meta"><span>{project.category.toUpperCase()} / CONCEPT</span><span>{project.number}</span></div><div className="studio-project__title"><h3>{project.title}</h3><Arrow /></div><p>{project.descriptor}</p></Link>)}</div>{!all && <div className="studio-section-tail"><Action to="/work" outline>View all work</Action></div>}</div></section>
}

export function DifferenceFeature() {
  return <section className="studio-difference studio-section" id="difference"><div className="studio-wrap"><Label index="05 / 08">WHY MOREWARD</Label><div className="studio-difference__grid"><h2>More than the<br/>sum of its <em>parts.</em></h2><div><p>Strategy. Creative. Growth. Technology. Media. Systems.</p><p>Each is useful on its own. Together, they create a more complete path from what a business wants to say to what customers choose to do.</p><div className="studio-difference__rule"><span>ONE POINT OF VIEW</span><span>↗</span></div></div></div></div></section>
}

export function IndustriesFeature() {
  return <section className="studio-industries studio-section" id="industries"><div className="studio-wrap"><div className="studio-section-head"><Label index="06 / 08">INDUSTRIES</Label><h2>Ambition has<br/><em>no category.</em></h2><p>Our work begins with the business and its audience, not an industry playbook.</p></div><div className="studio-industries__field">{industries.map((industry, i) => <span key={industry}><small>0{i + 1}</small>{industry}</span>)}</div><div className="studio-industries__note">INDUSTRY AGNOSTIC BY DESIGN <span>MOREWARD STUDIO / WORLDWIDE</span></div></div></section>
}

export function ClosingFeature({ title = <>Let's build<br/><em>what's next.</em></>, copy = 'Tell us what you are building, where you want to go, and what is standing in the way.' }) {
  return <section className="studio-closing" id="closing"><div className="studio-wrap"><Label index="↗ / 08">THE NEXT MOVE</Label><h2>{title}</h2><div className="studio-closing__bottom"><p>{copy}</p><Action to="/contact">Start a project</Action></div></div></section>
}

export function ContactFeature() {
  const [status, setStatus] = useState('')
  function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const data = new FormData(form)
    const body = ['Hello Moreward Studio,', '', 'I would like to discuss a project.', '', ...[['Name','name'],['Company','company'],['Work email','email'],['Project ambition','ambition'],['Timing / budget','context']].map(([label,key]) => `${label}: ${data.get(key) || 'Not provided'}`)].join('\n')
    window.location.href = `mailto:sujay@nidhivriddhi.com?subject=${encodeURIComponent(`Moreward project enquiry — ${data.get('company')}`)}&body=${encodeURIComponent(body)}`
    setStatus('Your email app should open with the message ready to send.')
  }
  return <section className="studio-contact studio-section"><div className="studio-wrap"><Label index="04 / CONTACT">START A PROJECT</Label><div className="studio-contact__grid"><div><h1>Let's make<br/><em>the next move.</em></h1><p>Tell us the challenge. We will start with a conversation about the business, the audience, and what progress could look like.</p><a href="mailto:sujay@nidhivriddhi.com">sujay@nidhivriddhi.com <Arrow /></a></div><form onSubmit={submit} className="studio-form"><div className="studio-form__row"><label>Name *<input name="name" autoComplete="name" required placeholder="Your name" /></label><label>Company *<input name="company" autoComplete="organization" required placeholder="Company name" /></label></div><label>Work email *<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label><label>What are you looking to build? *<textarea name="ambition" required rows="5" placeholder="The ambition, opportunity, or challenge" /></label><label>Timing or budget context <span>(optional)</span><input name="context" placeholder="Anything useful to know" /></label><div className="studio-form__end"><button type="submit" className="studio-action"><span>Start a project</span><Arrow /></button><p>This prepares an email in your own email app. The website does not store your answers.</p></div>{status && <p role="status">{status}</p>}</form></div></div></section>
}
