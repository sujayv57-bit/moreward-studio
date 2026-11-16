import { Link, useParams } from '@tanstack/react-router'
import { capabilities, engagementTypes, homeSteps, imagery, projects, studioPrinciples, studioSteps } from './data.js'
import { STUDIO_EMAIL } from '../config/site.js'
import { HomeHero } from './home-hero.jsx'
import { ContactForm, NextSteps } from './contact-form.jsx'
import { Arrow, Breadcrumb, ConversionLink, CtaBand, EmailLink, Eyebrow, ImageFrame, NextNavigation, ResponsiveImage, RevealWords, StudyCard, TextLink } from './ui.jsx'

const two = number => String(number).padStart(2, '0')
const studyPath = project => '/work/' + project.slug
const capPath = capability => '/capabilities/' + capability.slug

export function HomePage() {
  return <><HomeHero/>
    <section id="introduction" className="b-intro b-panel-light"><Eyebrow index="01 / 04">POINT OF VIEW</Eyebrow><div className="b-intro__grid"><div><RevealWords text="An idea is only as good as where it ends up." className="b-intro__title"/><ImageFrame image={imagery.application} alt="Moreward identity on apparel and tote" className="b-intro__image" sizes="(max-width: 767px) 100vw, 60vw"/></div><div className="b-intro__aside"><p>Most work loses its shape somewhere between the brief, the media plan and the systems behind them. We keep strategy, creative, media and technology in one room, so the idea arrives the way it was meant to.</p><TextLink to="/studio">MEET THE STUDIO</TextLink></div></div></section>
    <section id="capabilities" className="b-capabilities b-panel-dark"><div className="b-section-head"><Eyebrow light index="02 / 04">WHAT WE DO</Eyebrow><div><RevealWords text="Three disciplines, one team."/><p>Most businesses hire separate people for the brand, the media and the technology, then spend months getting them to agree. We do all three, so the thinking carries through.</p></div></div><div className="b-capabilities__list">{capabilities.map(item => <Link key={item.slug} className="b-capability-row" to={capPath(item)}><span className="b-capability-row__number">{item.number}</span><div><h3>{item.name}</h3><p>{item.homeDescription}</p></div><ResponsiveImage image={item.visual} alt="" sizes="150px"/><Arrow diagonal/></Link>)}</div><TextLink to="/capabilities" className="b-section-tail">ALL CAPABILITIES</TextLink></section>
    <section id="work" className="b-work b-panel-light"><div className="b-section-head"><Eyebrow index="03 / 04">STUDIO STUDIES</Eyebrow><div><RevealWords text="Work we set ourselves."/><p>Self-initiated studies across identity, outdoor and interface design. Briefs we wrote for ourselves, held to the standard of a real one.</p></div></div><div className="b-work__grid">{projects.map((project, i) => <StudyCard key={project.slug} project={project} className={'b-project--' + (i + 1)}/>)}</div><div className="b-work__tail"><p>Self-initiated. No client or result is implied.</p><TextLink to="/work">SEE ALL STUDIES</TextLink></div></section>
    <section className="b-engagement-preview b-panel-light"><div><Eyebrow index="04 / 04">HOW WE WORK</Eyebrow><RevealWords text="A good start saves the rest of the project."/><p>We begin with the problem, not the deliverable.</p><ol className="b-steps-compact">{homeSteps.map((step, i) => <li key={step}><span>{two(i + 1)}</span>{step}</li>)}</ol><TextLink to="/studio#how-we-work">HOW WE WORK</TextLink></div><ImageFrame image={imagery.campaign} alt="Outdoor campaign panel with Moreward's run-and-rise line graphic" sizes="(max-width: 767px) 100vw, 50vw"/></section>
    <CtaBand/></>
}

export function WorkPage() {
  return <><section className="b-internal-hero b-work-hero b-panel-dark"><Eyebrow light>STUDIO STUDIES</Eyebrow><RevealWords as="h1" text="Briefs we wrote for ourselves."/><p>Three self-initiated studies across identity, outdoor and interface design. Each starts from a real problem and is held to the standard of a commissioned project.</p></section>
    <section className="b-work b-work--page b-panel-light"><h2 className="b-sr-only">Studio studies</h2><div className="b-work-index">{projects.map(project => <StudyCard key={project.slug} project={project} summary/>)}</div></section>
    <section className="b-work-note b-panel-light"><p>These are self-initiated studies, not client work, and no results are claimed. Client projects will appear here as they launch, with the client's permission and outcomes we can stand behind.</p></section><CtaBand/></>
}

export function ProjectPage() {
  const { slug } = useParams({ from: '/work/$slug' })
  const index = projects.findIndex(project => project.slug === slug)
  if (index < 0) return <NotFoundPage/>
  const project = projects[index], next = projects[(index + 1) % projects.length]
  return <><section className="b-project-detail__hero b-panel-dark"><div className="b-project-detail__hero-image"><ResponsiveImage image={project.image} alt={project.imageAlt} eager/></div><div className="b-project-detail__hero-shade"/><div className="b-project-detail__hero-copy"><Breadcrumb parent="Work" parentTo="/work" current={project.title}/><Eyebrow light>STUDY {project.number} / {project.category}</Eyebrow><RevealWords as="h1" text={project.title}/><p>{project.heroBody || project.summary}</p></div></section>
    <section className="b-project-detail__overview b-panel-light"><Eyebrow index="01 / 02">THE BRIEF</Eyebrow><h2>{project.briefTitle}</h2><p>{project.briefBody}</p></section>
    <section className="b-project-detail__visuals b-panel-light"><ImageFrame image={project.image} alt={project.imageAlt}/><ImageFrame image={project.secondary} alt={project.secondaryAlt}/></section>
    <section className="b-project-detail__direction b-panel-dark"><Eyebrow light index="02 / 02">THE APPROACH</Eyebrow><RevealWords text={project.approachTitle}/><div><p>{project.approachBody}</p><div><h3>WHAT THE STUDY COVERS</h3><ul>{project.covers.map(item => <li key={item}>{item}</li>)}</ul></div><small>Self-initiated study. No client commission or result is claimed.</small></div></section>
    <NextNavigation type="NEXT STUDY" title={next.title} to={studyPath(next)} allLabel="ALL WORK" allTo="/work"/><CtaBand/></>
}

export function CapabilitiesPage() {
  return <><section className="b-internal-hero b-capabilities-hero b-panel-light"><Eyebrow>CAPABILITIES</Eyebrow><RevealWords as="h1" text="Different strengths. One direction."/><p>Creative, media and technology under one roof, working from the same brief.</p><div className="b-capabilities-hero__graphic" aria-hidden="true"><span>01</span><i/><span>02</span><i/><span>03</span></div></section>
    <section className="b-discipline-hub b-panel-light"><Eyebrow index="01 / 02">THE DISCIPLINES</Eyebrow><h2 className="b-sr-only">The disciplines</h2>{capabilities.map(item => <article className="b-discipline-block" key={item.slug}><div className="b-discipline-block__number">{item.number}</div><div><h3>{item.name}</h3><p>{item.hubBody}</p><ul>{item.samples.map(sample => <li key={sample}>{sample}</li>)}</ul><TextLink to={capPath(item)}>EXPLORE {item.name.toUpperCase()}</TextLink></div><ResponsiveImage image={item.visual} alt={item.visualAlt} sizes="(max-width: 767px) 100vw, 32vw"/></article>)}</section>
    <section className="b-overlap b-panel-light"><div><Eyebrow index="02 / 02">WHERE THEY MEET</Eyebrow><RevealWords text="The best work happens in the overlap."/><p>A metro campaign that sends people to a landing page, which feeds a CRM that shows which channels are bringing in enquiries. Elsewhere that is three vendors. Here it is one project.</p></div><div className="b-overlap__images"><ImageFrame image={imagery.application} alt="Moreward identity on apparel and tote"/><ImageFrame image={imagery.web} alt="Moreward digital experience on a laptop"/></div></section><CtaBand/></>
}

export function CapabilityPage() {
  const { slug } = useParams({ from: '/capabilities/$slug' })
  const index = capabilities.findIndex(item => item.slug === slug)
  if (index < 0) return <NotFoundPage/>
  const item = capabilities[index], next = capabilities[(index + 1) % capabilities.length], related = projects.find(project => project.slug === item.relatedSlug)
  return <><section className={'b-cap-detail-hero b-cap-detail-hero--' + item.slug + ' b-panel-dark'}><div className="b-cap-detail-hero__image"><ResponsiveImage image={item.visual} alt={item.visualAlt} eager/></div><div className="b-cap-detail-hero__shade"/><div className="b-cap-detail-hero__content"><Breadcrumb parent="Capabilities" parentTo="/capabilities" current={item.name}/><Eyebrow light>{item.number} / {item.name.toUpperCase()}</Eyebrow><RevealWords as="h1" text={item.title}/><p>{item.heroBody}</p></div></section>
    <section className="b-cap-detail-intro b-panel-light"><Eyebrow>THE THINKING</Eyebrow><RevealWords text={item.thinkingTitle}/><p>{item.thinkingBody}</p></section>
    <section className="b-cap-detail-sections b-panel-light">{item.sections.map(([heading, copy], i) => <article key={heading} data-reveal><span>{two(i + 1)}</span><h3>{heading}</h3><p>{copy}</p></article>)}</section>
    <section className="b-cap-detail-showcase b-panel-light"><ImageFrame image={item.secondary} alt={item.secondaryAlt}/><div><Eyebrow>WHAT THE WORK CAN INCLUDE</Eyebrow><ul>{item.services.map(service => <li key={service}>{service}</li>)}</ul><p>Every scope is built around the project. These are areas of practice, not packages.</p></div></section>
    <section className="b-related b-panel-light"><Eyebrow>RELATED STUDY</Eyebrow><StudyCard project={related} summary/></section>
    <NextNavigation type="NEXT DISCIPLINE" title={next.name} to={capPath(next)} allLabel="ALL CAPABILITIES" allTo="/capabilities"/><CtaBand capability={item}/></>
}

export function StudioPage() {
  return <><section className="b-studio-hero b-panel-light"><div><Eyebrow>THE STUDIO</Eyebrow><RevealWords as="h1" text="Independent by nature. Intentional by design."/><p>Moreward is an independent studio for creative, advertising and technology work. We keep strategy, design, media and systems in the same conversation, because that is where good work comes from.</p></div><ImageFrame image={imagery.environment} alt="Moreward Studio identity in an architectural interior" eager/></section>
    <section className="b-studio-principles b-panel-dark"><Eyebrow light index="01 / 03">WHAT WE HOLD TO</Eyebrow><h2 className="b-sr-only">What we hold to</h2><div className="b-studio-principles__layout"><div>{studioPrinciples.map(([title, body], i) => <article key={title} data-reveal><span>{two(i + 1)}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div><ImageFrame image={imagery.application} alt="Moreward identity on apparel and tote"/></div></section>
    <section id="how-we-work" className="b-studio-process b-panel-light"><Eyebrow index="02 / 03">HOW WE WORK</Eyebrow><RevealWords text="The right work starts with the right conversation."/><p>Before we talk about deliverables, we want to understand the business, the problem and what a good outcome looks like.</p><div className="b-studio-process__steps">{studioSteps.map(([title, body], i) => <article key={title}><span>{two(i + 1)}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="b-studio-ways b-panel-light"><Eyebrow index="03 / 03">WAYS OF WORKING</Eyebrow><RevealWords text="The shape of the engagement follows the problem."/><div>{engagementTypes.map(([title, body], i) => <article key={title}><span>{two(i + 1)}</span><h3>{title}</h3><p>{body}</p></article>)}</div><p>We don't publish fixed packages. Every engagement is scoped after the first conversation.</p></section><CtaBand variant="studio"/></>
}

export function ContactPage() {
  return <section className="b-contact-page b-panel-light"><div className="b-contact-page__intro"><Eyebrow>START A PROJECT</Eyebrow><RevealWords as="h1" text="Let's make something move."/><p>Tell us what you're working on: a launch, a campaign, a system that isn't working, or an idea that needs shape. We read every enquiry.</p><div className="b-contact-page__details"><div><span>DIRECT ENQUIRIES</span><EmailLink>{STUDIO_EMAIL}</EmailLink></div><NextSteps/></div></div><ContactForm/></section>
}

export function LegalPage({ type }) {
  const privacy = type === 'privacy'
  return <section className="b-legal b-panel-light"><Eyebrow>MOREWARD / INFORMATION</Eyebrow><RevealWords as="h1" text={privacy ? 'Privacy Policy' : 'Terms'}/><p>Last updated: 13 November 2026</p>{privacy ? <div><p>This site has no accounts. When you send an enquiry, your name, email, company and message are emailed to us so we can reply. They are not stored in a database on this website.</p><p>Enquiries are delivered through Resend, our email provider. Visits are measured with Vercel Web Analytics, which does not use cookies.</p><p>This site loads no third-party fonts, tracking or advertising scripts.</p><p>Questions about privacy: <EmailLink>{STUDIO_EMAIL}</EmailLink>.</p></div> : <div><p>The studies on this site are self-initiated work by Moreward. They do not represent client engagements, and no results are implied.</p><p>All content on this site belongs to Moreward unless stated otherwise. Commercial terms for client work are agreed separately for each project.</p></div>}</section>
}

export function NotFoundPage() {
  return <section className="b-not-found b-panel-dark"><Eyebrow light>404 / WRONG TURN</Eyebrow><RevealWords as="h1" text="This path goes nowhere."/><p>The page may have moved, or it never existed.</p><nav aria-label="Explore Moreward"><Link to="/work">Work</Link><Link to="/capabilities">Capabilities</Link><Link to="/studio">Studio</Link><Link to="/contact">Contact</Link></nav><ConversionLink to="/" location="404" light>BACK HOME</ConversionLink></section>
}
