import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { capabilities, engagementTypes, homeSteps, imagery, projects, studioPrinciples } from './data.js'
import { STUDIO_EMAIL } from '../config/site.js'
import { HomeHero } from './home-hero.jsx'
import { ContactForm, NextSteps } from './contact-form.jsx'
import { WhySection } from './why.jsx'
import { HomeContact } from './home-contact.jsx'
import { ToolOrbits } from './tool-orbits.jsx'
import { StudioProcess } from './studio-process.jsx'
import { Arrow, Breadcrumb, ConversionLink, CtaBand, EmailLink, Eyebrow, ImageFrame, NextNavigation, ResponsiveImage, RevealWords, StudyCard, TextLink } from './ui.jsx'

const two = number => String(number).padStart(2, '0')
const studyPath = project => '/work/' + project.slug
const capPath = capability => '/capabilities/' + capability.slug
// The Home grid is laid out for three cards: it features client work; the Work page lists everything.
const homeProjects = projects.filter(project => project.client).slice(0, 3)

// Home capability row. On hover (or keyboard focus) the services in the discipline drop down.
// Touch screens have no hover, so each row opens once it scrolls into the middle of the screen
// and stays open, which keeps the page from jumping as people scroll back up.
function CapabilityRow({ item }) {
  const ref = useRef(null)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const row = ref.current
    if (!row || typeof window === 'undefined' || !window.matchMedia('(hover:none)').matches || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect() }
    }, { rootMargin: '0px 0px -35% 0px' })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])
  const services = item.homeServices || item.services
  return <Link ref={ref} className={'b-capability-row' + (revealed ? ' is-open' : '')} to={capPath(item)}><div><h3>{item.name}</h3><p>{item.homeDescription}</p><div className="b-capability-row__services"><div><ul aria-label={item.name + ' services'}>{services.map((service, i) => <li key={service} style={{ '--i': i }}>{service}</li>)}</ul></div></div></div><ResponsiveImage image={item.visual} alt="" sizes="150px"/><Arrow diagonal/></Link>
}

export function HomePage() {
  return <><HomeHero/>
    <section id="introduction" className="b-intro b-intro--text b-panel-light"><Eyebrow index="01 / 05">Point of view</Eyebrow><div className="b-intro__grid"><div><RevealWords text="An idea is only as good as where it ends up." className="b-intro__title"/></div><div className="b-intro__aside"><p>Most work loses its shape somewhere between the brief, the media plan and the systems behind them. We keep strategy, creative, media and technology in one room, so the idea arrives the way it was meant to.</p><TextLink to="/studio">Meet the studio</TextLink></div></div></section>
    <section id="capabilities" className="b-capabilities b-panel-dark"><div className="b-section-head"><Eyebrow light index="02 / 05">What we do</Eyebrow><div><RevealWords text="Three disciplines, one team."/><p>Most businesses hire separate people for the brand, the media and the technology, then spend months getting them to agree. We do all three, so the thinking carries through.</p></div></div><div className="b-capabilities__list">{capabilities.map(item => <CapabilityRow key={item.slug} item={item}/>)}</div><TextLink to="/capabilities" className="b-section-tail">All capabilities</TextLink></section>
    <ToolOrbits/>
    <WhySection index="03 / 05"/>
    <section id="work" className="b-work b-panel-light"><div className="b-section-head"><Eyebrow index="04 / 05">Selected work</Eyebrow><div><RevealWords text="Selected work."/><p>Brand identities for BETACH Consulting Services, Kriya Setu and Rucaa.</p></div></div><div className="b-work__grid">{homeProjects.map((project, i) => <StudyCard key={project.slug} project={project} className={'b-project--' + (i + 1)}/>)}</div><div className="b-work__tail"><TextLink to="/work">See all work</TextLink></div></section>
    <section className="b-engagement-preview b-panel-light"><div><Eyebrow index="05 / 05">How we work</Eyebrow><RevealWords text="A good start saves the rest of the project."/><p>We begin with the problem, not the deliverable.</p><ol className="b-steps-compact">{homeSteps.map((step, i) => <li key={step}><span>{two(i + 1)}</span>{step}</li>)}</ol><TextLink to="/studio#how-we-work">How we work</TextLink></div><ImageFrame image={imagery.howWeWork} alt="" sizes="(max-width: 767px) 100vw, 50vw"/></section>
    <HomeContact/></>
}

export function WorkPage() {
  return <><section className="b-internal-hero b-work-hero b-panel-dark"><Eyebrow light>Work</Eyebrow><RevealWords as="h1" text="Selected work."/><p>Brand identities for BETACH Consulting Services, Kriya Setu and Rucaa.</p></section>
    <section className="b-work b-work--page b-panel-light"><h2 className="b-sr-only">Projects</h2><div className="b-work-index">{projects.map((project, i) => <StudyCard key={project.slug} project={project} summary eager={i === 0}/>)}</div></section>
    <section className="b-work-note b-panel-light"><p>More client projects will appear here as they launch.</p></section><CtaBand/></>
}

export function ProjectPage() {
  const { slug } = useParams({ from: '/work/$slug' })
  const index = projects.findIndex(project => project.slug === slug)
  if (index < 0) return <NotFoundPage/>
  const project = projects[index], next = projects[(index + 1) % projects.length]
  if (project.href) return <NotFoundPage/>
  return <><section className="b-project-detail__hero b-panel-dark"><div className="b-project-detail__hero-image"><ResponsiveImage image={project.image} alt={project.imageAlt} eager/></div><div className="b-project-detail__hero-shade"/><div className="b-project-detail__hero-copy"><Breadcrumb parent="Work" parentTo="/work" current={project.title}/><Eyebrow light>STUDY {project.number} / {project.category}</Eyebrow><RevealWords as="h1" text={project.title}/><p>{project.heroBody || project.summary}</p></div></section>
    <section className="b-project-detail__overview b-panel-light"><Eyebrow index="01 / 02">The brief</Eyebrow><h2>{project.briefTitle}</h2><p>{project.briefBody}</p></section>
    <section className="b-project-detail__visuals b-panel-light"><ImageFrame image={project.image} alt={project.imageAlt}/>{project.secondary && <ImageFrame image={project.secondary} alt={project.secondaryAlt}/>}</section>
    <section className="b-project-detail__direction b-panel-dark"><Eyebrow light index="02 / 02">The approach</Eyebrow><RevealWords text={project.approachTitle}/><div><p>{project.approachBody}</p><div><h3>What the study covers</h3><ul>{project.covers.map(item => <li key={item}>{item}</li>)}</ul></div><small>Self-initiated study. No client commission or result is claimed.</small></div></section>
    <NextNavigation type={next.client ? 'Next project' : 'Next study'} title={next.title} to={studyPath(next)} href={next.href} allLabel="All work" allTo="/work"/><CtaBand/></>
}

export function CapabilitiesPage() {
  return <><section className="b-internal-hero b-capabilities-hero b-panel-light"><Eyebrow>Capabilities</Eyebrow><RevealWords as="h1" text="Different strengths. One direction."/><p>Creative, media and technology under one roof, working from the same brief.</p><div className="b-capabilities-hero__graphic" aria-hidden="true"><span>01</span><i/><span>02</span><i/><span>03</span></div></section>
    <section className="b-discipline-hub b-panel-light"><Eyebrow index="01 / 02">The disciplines</Eyebrow><h2 className="b-sr-only">The disciplines</h2>{capabilities.map(item => <article className="b-discipline-block" key={item.slug}><div className="b-discipline-block__number">{item.number}</div><div><h3>{item.name}</h3><p>{item.hubBody}</p><ul>{item.samples.map(sample => <li key={sample}>{sample}</li>)}</ul><TextLink to={capPath(item)}>Explore {item.name}</TextLink></div><ResponsiveImage image={item.visual} alt={item.visualAlt} sizes="(max-width: 767px) 100vw, 32vw"/></article>)}</section>
    <section className="b-overlap b-overlap--text b-panel-light"><div><Eyebrow index="02 / 02">Where they meet</Eyebrow><RevealWords text="The best work happens in the overlap."/><p>A metro campaign that sends people to a landing page, which feeds a CRM that shows which channels are bringing in enquiries. Elsewhere that is three vendors. Here it is one project.</p></div></section><CtaBand/></>
}

export function CapabilityPage() {
  const { slug } = useParams({ from: '/capabilities/$slug' })
  const index = capabilities.findIndex(item => item.slug === slug)
  if (index < 0) return <NotFoundPage/>
  const item = capabilities[index], next = capabilities[(index + 1) % capabilities.length], related = projects.find(project => project.slug === item.relatedSlug)
  return <><section className={'b-cap-detail-hero b-cap-detail-hero--' + item.slug + ' b-panel-dark'}><div className="b-cap-detail-hero__image"><ResponsiveImage image={item.visual} alt={item.visualAlt} eager/></div><div className="b-cap-detail-hero__shade"/><div className="b-cap-detail-hero__content"><Breadcrumb parent="Capabilities" parentTo="/capabilities" current={item.name}/><Eyebrow light>{item.number} / {item.name}</Eyebrow><RevealWords as="h1" text={item.title}/><p>{item.heroBody}</p></div></section>
    <section className="b-cap-detail-intro b-panel-light"><Eyebrow>The thinking</Eyebrow><RevealWords text={item.thinkingTitle}/><p>{item.thinkingBody}</p></section>
    <section className="b-cap-detail-sections b-panel-light">{item.sections.map(([heading, copy], i) => <article key={heading} data-reveal><span>{two(i + 1)}</span><h3>{heading}</h3><p>{copy}</p></article>)}</section>
    <section className="b-cap-detail-showcase b-cap-detail-showcase--text b-panel-light"><div><Eyebrow>What the work can include</Eyebrow><ul>{item.services.map(service => <li key={service}>{service}</li>)}</ul><p>Every scope is built around the project. These are areas of practice, not packages.</p></div></section>
    {related && <section className="b-related b-panel-light"><Eyebrow>{related.client ? 'Related work' : 'Related study'}</Eyebrow><StudyCard project={related} summary/></section>}
    <NextNavigation type="Next discipline" title={next.name} to={capPath(next)} allLabel="All capabilities" allTo="/capabilities"/><CtaBand capability={item}/></>
}

export function StudioPage() {
  return <><section className="b-studio-hero b-studio-hero--text b-panel-light"><div><Eyebrow>The studio</Eyebrow><RevealWords as="h1" text="Independent by nature. Intentional by design."/><p>Moreward is an independent studio for creative, advertising and technology work. We keep strategy, design, media and systems in the same conversation, because that is where good work comes from.</p></div></section>
    <section className="b-studio-principles b-studio-principles--text b-panel-dark"><Eyebrow light index="01 / 03">What we hold to</Eyebrow><h2 className="b-sr-only">What we hold to</h2><div className="b-studio-principles__layout"><div>{studioPrinciples.map(([title, body], i) => <article key={title} data-reveal><span>{two(i + 1)}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div></div></section>
    <StudioProcess/>
    <section className="b-studio-ways b-panel-light"><Eyebrow index="03 / 03">Ways of working</Eyebrow><RevealWords text="The shape of the engagement follows the problem."/><div>{engagementTypes.map(([title, body], i) => <article key={title}><span>{two(i + 1)}</span><h3>{title}</h3><p>{body}</p></article>)}</div><p>We don't publish fixed packages. Every engagement is scoped after the first conversation.</p></section><CtaBand variant="studio"/></>
}

export function ContactPage() {
  return <section className="b-contact-page b-panel-light"><div className="b-contact-page__intro"><Eyebrow>Start a project</Eyebrow><RevealWords as="h1" text="Let's make something move."/><p>Tell us what you're working on: a launch, a campaign, a system that isn't working, or an idea that needs shape. We read every enquiry.</p><div className="b-contact-page__details"><div><span>Direct enquiries</span><EmailLink>{STUDIO_EMAIL}</EmailLink></div><NextSteps/></div></div><ContactForm/></section>
}

export function LegalPage({ type }) {
  const privacy = type === 'privacy'
  return <section className="b-legal b-panel-light"><Eyebrow>Moreward / information</Eyebrow><RevealWords as="h1" text={privacy ? 'Privacy Policy' : 'Terms'}/><p>Last updated: 13 November 2026</p>{privacy ? <div><p>This site has no accounts. When you send an enquiry, your name, email, company and message are emailed to us so we can reply. They are not stored in a database on this website.</p><p>Enquiries are delivered through Resend, our email provider. Visits are measured with Vercel Web Analytics, which does not use cookies.</p><p>This site loads no third-party fonts, tracking or advertising scripts.</p><p>Questions about privacy: <EmailLink>{STUDIO_EMAIL}</EmailLink>.</p></div> : <div><p>All content on this site belongs to Moreward unless stated otherwise. Commercial terms for client work are agreed separately for each project.</p></div>}</section>
}

export function NotFoundPage() {
  return <section className="b-not-found b-panel-dark"><Eyebrow light>404 / Wrong turn</Eyebrow><RevealWords as="h1" text="This path goes nowhere."/><p>The page may have moved, or it never existed.</p><nav aria-label="Explore Moreward"><Link to="/work">Work</Link><Link to="/capabilities">Capabilities</Link><Link to="/studio">Studio</Link><Link to="/contact">Contact</Link></nav><ConversionLink to="/" location="404" light>Back home</ConversionLink></section>
}
