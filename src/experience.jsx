import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities, industries, method, projects } from './brand.js'
import symbol from '../brand-kit/01-logos/symbol-bone-512.png'
import whiteWordmark from '../brand-kit/01-logos/wordmark-white.png'
import heroBadge from './assets/hero-badge.jpg'
import brandApplication from './assets/brand-application.jpg'
import identityCards from './assets/identity-cards.jpg'
import campaignShelter from './assets/campaign-shelter.jpg'
import studioEnvironment from './assets/studio-environment.jpg'
import digitalDevice from './assets/digital-device.jpg'
import digitalExperience from './assets/digital-experience.jpg'

const Arrow = () => <span className="mw-arrow" aria-hidden="true">↗</span>
const Kicker = ({ index, children }) => <p className="mw-kicker"><span>{index}</span>{children}</p>
const LinkButton = ({ to, children, light = false }) => <Link className={`mw-button${light ? ' mw-button--light' : ''}`} to={to}><span>{children}</span><Arrow /></Link>

function AnimatedLine({ children, as: Tag = 'h2', className = '' }) {
  return <Tag className={`mw-reveal-line ${className}`} data-reveal>{children}</Tag>
}

export function ExperienceHero() {
  return <section className="mw-hero" id="top">
    <div className="mw-hero__artifact" aria-label="Moreward Studio identity badge suspended from a woven lanyard"><img className="mw-hero__photograph" src={heroBadge} alt="" fetchPriority="high" /><div className="mw-hero__badge-brand"><img className="mw-hero__badge-wordmark" src={whiteWordmark} alt=""/><span>MORE IMPACT. MORE FORWARD.</span><img className="mw-hero__badge-symbol" src={symbol} alt=""/></div></div>
    <div className="mw-hero__base mw-container"><div className="mw-hero__label"><span>INDEPENDENT CREATIVE + GROWTH STUDIO</span><span>WORLDWIDE / 2026</span></div><h1><span>More impact.</span><span>More <em>forward.</em></span></h1><div className="mw-hero__bottom"><p>Strategy, creativity, media, technology and systems—connected to help ambitious businesses get discovered, acquire the right customers and grow.</p><div className="mw-hero__actions"><LinkButton to="/contact">Start a project</LinkButton><Link className="mw-text-link" to="/projects">Explore the work <Arrow /></Link></div></div></div>
    <div className="mw-hero__scroll">SCROLL TO EXPLORE <span>↓</span></div>
  </section>
}

export function DisciplineStrip() {
  return <div className="mw-strip" aria-label="Moreward disciplines"><div className="mw-container">{['STRATEGY','CREATIVE','GROWTH','DIGITAL','MEDIA','SYSTEMS'].map((name,i)=><span key={name}><small>0{i+1}</small>{name}</span>)}</div></div>
}

export function ExperiencePoint() {
  return <section className="mw-point mw-section" id="point-of-view"><div className="mw-container"><Kicker index="01 / POINT OF VIEW">THE THINKING BEHIND THE WORK</Kicker><AnimatedLine className="mw-point__statement">Marketing should do more than make noise. <em>It should move the business.</em></AnimatedLine><div className="mw-point__bottom" data-reveal><span className="mw-point__sig">M<span>↗</span></span><div><p>We don’t just create marketing. We build connected systems that generate and convert demand.</p><p>From the first impression to the decision to choose, every part of the work has a role.</p></div></div></div></section>
}

export function ExperienceWork({ all = false }) {
  const visible = all ? projects : projects.slice(0, 4)
  return <section className="mw-work mw-section" id="work"><div className="mw-container"><div className="mw-section-title"><Kicker index="02 / SELECTED WORK">THE WORK</Kicker><AnimatedLine>Ideas made <em>visible.</em></AnimatedLine><p>Original visual explorations across identity, campaigns and connected systems.</p></div><div className="mw-work__frame"><div className="mw-work__frame-head"><span>MOREWARD STUDIO / CONCEPT STUDIES</span><span>01—0{visible.length}</span></div><div className="mw-work__grid">{visible.map((project,i)=><Link className={`mw-work__item mw-work__item--${i+1}`} key={project.slug} to="/work/$slug" params={{slug:project.slug}} aria-label={`${project.title}, illustrative concept study`}><div className="mw-work__image"><img src={project.image} alt={project.imageAlt} loading="lazy" /></div><div className="mw-work__caption"><span>{project.title}</span><Arrow /></div></Link>)}</div><div className="mw-work__frame-foot"><span>ILLUSTRATIVE CONCEPTS / NO CLIENT WORK IMPLIED</span><Link to="/projects">VIEW ALL PROJECTS <Arrow /></Link></div></div>{!all && <p className="mw-work__note">These directions show the thinking. No client engagement or measured result is implied.</p>}</div></section>
}

function CapabilityVisual({ index }) {
  const images=[identityCards,campaignShelter,brandApplication,studioEnvironment,digitalDevice,digitalExperience]
  const alts=['Moreward identity on printed business cards','Illustrative outdoor campaign direction','Moreward apparel, notebook and tote applications','Moreward identity applied to a spatial environment','Concept device with a connected signal path','Moreward digital experience on a laptop']
  return <div className={`mw-cap-visual mw-cap-visual--photographic mw-cap-visual--${index}`}><img src={images[index]} alt={alts[index]} loading="lazy" /></div>
}

export function ExperienceCapabilities() {
  return <section className="mw-capabilities mw-section" id="services"><div className="mw-container"><div className="mw-section-title mw-section-title--light"><Kicker index="03 / SERVICES">WHAT WE DO</Kicker><AnimatedLine>What we do, <em>together.</em></AnimatedLine><p>Six complementary practices, assembled around the work that needs to move.</p></div><div className="mw-capabilities__frame"><div className="mw-capabilities__meta"><span>MOREWARD SERVICES</span><span>01 — 06</span></div><div className="mw-capabilities__grid">{capabilities.map((item,i)=><Link className="mw-capability" to="/capabilities/$slug" params={{slug:item.slug}} key={item.slug} data-reveal><div className="mw-capability__top"><span>0{i+1} / 06</span><Arrow /></div><CapabilityVisual index={i}/><div className="mw-capability__bottom"><h3>{item.name}</h3><p>{item.line}</p></div></Link>)}</div><div className="mw-capabilities__tail"><span>CREATIVE THINKING / USEFUL TECHNOLOGY</span><Link to="/capabilities">EXPLORE ALL SERVICES <Arrow /></Link></div></div></div></section>
}

export function ExperienceProcess() {
  const [active,setActive]=useState(0)
  const triggers=useRef([])
  useEffect(()=>{
    if (window.matchMedia('(max-width: 700px)').matches) return
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)
      if(visible.length) setActive(Number(visible[0].target.dataset.index))
    },{rootMargin:'-42% 0px -42% 0px',threshold:0})
    triggers.current.forEach(node=>node&&observer.observe(node))
    return()=>observer.disconnect()
  },[])
  return <section className="mw-process" id="process"><div className="mw-process__sticky"><div className="mw-container mw-process__inner"><div className="mw-process__top"><span>+</span><span>THE MOREWARD METHOD</span><span>+</span></div><div className="mw-process__main"><span className="mw-process__count">0{active+1}<small> / 0{method.length}</small></span><div><h2 key={active} className="mw-process-stage">{method[active][0]}</h2><p key={active}>{method[active][1]}</p></div></div><div className="mw-process__progress" aria-label={`Current stage: ${method[active][0]}`}>{method.map(([name],i)=><div key={name} className={i===active?'is-active':i<active?'is-past':''}><span>0{i+1}</span><strong>{name}</strong></div>)}</div></div></div><div className="mw-process__triggers" aria-hidden="true">{method.map(([name],i)=><div key={name} data-index={i} ref={node=>triggers.current[i]=node}/>)}</div><div className="mw-process__mobile"><div className="mw-container"><Kicker index="04 / HOW WE WORK">MOREWARD METHOD</Kicker><h2>From first question <em>to what’s next.</em></h2>{method.map(([name,detail],i)=><article key={name}><span>0{i+1}</span><div><h3>{name}</h3><p>{detail}</p></div></article>)}</div></div></section>
}

export function ExperienceWhy() {
  return <section className="mw-why mw-section" id="why"><div className="mw-container"><div className="mw-section-title"><Kicker index="05 / WHY MOREWARD">ONE CONNECTED PRACTICE</Kicker><AnimatedLine>More than the sum <em>of its parts.</em></AnimatedLine><p>Strategy, creative, growth, technology, media and systems work better when they share a direction.</p></div><div className="mw-why__collage"><div className="mw-why__mark"><img src={symbol} alt="" loading="lazy" /><span>MORE<br/>+<br/>FORWARD</span></div><div className="mw-why__principle"><span>THE QUESTION</span><strong>What needs<br/>to move?</strong><p>We begin with the business objective and the people it needs to reach.</p></div><div className="mw-why__line"><span>STRATEGY</span><i/><span>CREATIVE</span><i/><span>ACQUISITION</span><i/><span>CONVERSION</span></div><div className="mw-why__statement"><span>THE RESULT WE WORK TOWARD</span><strong>Connected<br/><em>momentum.</em></strong></div></div></div></section>
}

export function ExperienceIndustries() {
  return <section className="mw-industries mw-section" id="industries"><div className="mw-container"><Kicker index="06 / INDUSTRIES">NO INDUSTRY PLAYBOOK</Kicker><AnimatedLine>Ambition has <em>no category.</em></AnimatedLine><p>We start with the business and its audience. The same connected thinking can move across sectors and markets.</p><div className="mw-industries__field">{industries.map((name,i)=><span key={name}><small>0{i+1}</small>{name}</span>)}</div></div></section>
}

const questions=[
  ['What kind of work does Moreward take on?','Projects can begin with a strategic challenge, a brand, an acquisition system, a digital experience, a media brief or a business workflow. We shape the disciplines around the objective.'],
  ['Do you work across industries?','Yes. Our work starts with the business, customer and market. Industry experience informs the approach, but does not limit it.'],
  ['Can we work together on one capability?','Yes. A focused engagement can sit within one capability, with a clear view of how it connects to the rest of the customer journey.'],
  ['How does a project begin?','Tell us where the business is today, what you want to achieve and what stands in the way. We start with a conversation and define the right next step.'],
]
export function ExperienceFAQ(){return <section className="mw-faq mw-section" id="questions"><div className="mw-container"><Kicker index="07 / QUESTIONS">CLEAR ANSWERS</Kicker><div className="mw-faq__grid"><AnimatedLine>Good questions.<br/><em>Better beginnings.</em></AnimatedLine><div>{questions.map(([question,answer],i)=><details key={question}><summary><span>0{i+1}</span>{question}<b aria-hidden="true">+</b></summary><p>{answer}</p></details>)}</div></div></div></section>}

function handleMail(event){
  event.preventDefault()
  const form=event.currentTarget
  if(!form.reportValidity())return
  const data=new FormData(form)
  const lines=['Hello Moreward Studio,','','I would like to start a conversation.','','Name: '+data.get('name'),'Work email: '+data.get('email'),'What I am building: '+data.get('message')]
  window.location.href=`mailto:sujay@nidhivriddhi.com?subject=${encodeURIComponent('Moreward Studio project enquiry')}&body=${encodeURIComponent(lines.join('\n'))}`
}
export function ExperienceClosing(){return <section className="mw-closing mw-section" id="closing"><div className="mw-container"><div className="mw-closing__panel"><div className="mw-closing__head"><span>08 / THE NEXT MOVE</span><span>MOREWARD STUDIO</span></div><AnimatedLine>Let’s build<br/><em>what’s next.</em></AnimatedLine><div className="mw-closing__body"><div><p>Tell us where the business is today and what you want it to become.</p><a href="mailto:sujay@nidhivriddhi.com">sujay@nidhivriddhi.com <Arrow /></a></div><form onSubmit={handleMail}><label>Your name<input name="name" autoComplete="name" required placeholder="Name" /></label><label>Work email<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label><label>What are you looking to build?<textarea name="message" required rows="3" placeholder="The ambition, opportunity or challenge" /></label><button type="submit">Start a project <Arrow /></button><small>Opens your email app with the message ready to send.</small></form></div></div></div></section>}
