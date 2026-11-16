import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { projects } from './brand.js'
import { prepareEnquiry } from './enquiry.js'
import environmentImage from './assets/studio-environment.jpg'
import brandImage from './assets/brand-application.jpg'
import handsImage from './assets/contact-hands.jpg'
import symbolImage from '../brand-kit/01-logos/symbol-ink-512.png'

const Arrow = () => <span className="ref-arrow" aria-hidden="true">↗</span>
const categoryOptions = ['All', 'Brand Identity', 'Campaigns', 'Digital Systems']

export function ReferenceAbout() {
  return <>
    <section className="ref-about-intro" aria-labelledby="about-title">
      <h1 id="about-title" className="sr-only">About Moreward Studio</h1>
      <div className="ref-about-intro__image ref-about-intro__image--lead"><img src={environmentImage} alt="Moreward Studio identity applied to an interior space" /></div>
      <div className="ref-about-intro__right"><p>Moreward is a creative and technology studio built around one belief: the work should move the business. We connect strategy, ideas, media and useful systems so every touchpoint has a purpose.</p><div className="ref-about-intro__image ref-about-intro__image--second"><img src={brandImage} alt="Moreward Studio identity applied to apparel, notebook and tote" /></div></div>
    </section>
    <div className="ref-about-strip" aria-label="The Moreward practice"><span>STRATEGY</span><span>CREATIVE</span><span>MEDIA</span><span>TECHNOLOGY</span></div>
    <section className="ref-about-belief"><div className="ref-about-belief__top"><span className="ref-barcode" aria-hidden="true" /><span>WHAT MOVES US.</span></div><div className="ref-about-belief__panel"><span className="ref-corner ref-corner--left">+</span><span className="ref-corner ref-corner--right">+</span><p className="ref-about-belief__eyebrow">MOREWARD / THINKING</p><h2 className="ref-text-mask" data-reveal>We make ideas<br/>work <em>harder.</em></h2><p>Good creative earns attention. Connected thinking helps turn it into something more meaningful.</p></div></section>
    <section className="ref-about-outlook"><div className="ref-about-outlook__text"><span>01 / THE PRACTICE</span><h2 className="ref-text-mask" data-reveal>Creativity and<br/><em>technology, together.</em></h2><p>We work across campaigns, influence, outdoor media, automation and digital systems. The mix changes with the challenge. The intent stays clear.</p></div><div className="ref-about-outlook__visual"><img src={symbolImage} alt="" loading="lazy" /><span>MORE + FORWARD</span></div></section>
  </>
}

export function ReferenceProjects() {
  const [category, setCategory] = useState('All')
  const visible = category === 'All' ? projects : projects.filter(project => project.category === category)
  return <section className="ref-projects" aria-labelledby="projects-title"><div className="ref-projects__heading"><span className="ref-barcode" aria-hidden="true"/><h1 id="projects-title">Projects.</h1></div><div className="ref-projects__filters" role="group" aria-label="Filter projects by category">{categoryOptions.map(option=><button key={option} type="button" className={category===option?'is-active':''} aria-pressed={category===option} onClick={()=>setCategory(option)}>{option}</button>)}</div><div className="ref-projects__grid" aria-live="polite">{visible.map(project=><Link key={project.slug} className="ref-project" to="/work/$slug" params={{slug:project.slug}} aria-label={`${project.title}, ${project.category} concept study`}><div className="ref-project__image"><img src={project.image} alt={project.imageAlt} loading="lazy"/><span className="ref-project__overlay">VIEW CONCEPT <Arrow/></span></div><div className="ref-project__meta"><span>{project.title}</span><small>{project.category} / CONCEPT</small></div></Link>)}</div><p className="ref-projects__disclaimer">Illustrative visual explorations. No client commission, result or endorsement is implied.</p></section>
}

export function ReferenceContact({ home = false }) {
  const Heading = home ? 'h2' : 'h1'
  return <section className={`ref-contact${home?' ref-contact--home':''}`} aria-labelledby={home?'home-contact-title':'contact-title'}><div className="ref-contact__panel"><img className="ref-contact__hands" src={handsImage} alt="Two hands reaching toward a shared point" loading={home?'lazy':'eager'} /><div className="ref-contact__content"><Heading id={home?'home-contact-title':'contact-title'}>Bring the ambition.<br/>We’ll find the way forward.<br/><span>Start here.</span></Heading><form onSubmit={prepareEnquiry}><label>Your name*<input name="name" autoComplete="name" required placeholder="Your name" /></label><label>Work email*<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label><label>Message*<textarea name="message" required rows="4" placeholder="What would you like to move?" /></label><button type="submit">Start a project <Arrow/></button></form><p className="ref-contact__note">Tell us a little about the business. We’ll take it from there.</p><small>Submitting opens your email app with the message ready to send.</small></div></div>{!home&&<div className="ref-contact__after"><p>Prefer a direct note?</p><a href="mailto:sujay@nidhivriddhi.com">sujay@nidhivriddhi.com <Arrow/></a></div>}</section>
}
