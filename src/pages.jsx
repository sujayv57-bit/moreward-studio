import { Link, useParams } from '@tanstack/react-router'
import { Seo } from './components.jsx'
import { capabilities, projects } from './brand.js'
import { Action, Arrow, Label, ClosingFeature } from './studio-sections.jsx'
import { ExperienceHero, DisciplineStrip, ExperiencePoint, ExperienceWork, ExperienceCapabilities, ExperienceProcess, ExperienceWhy, ExperienceFAQ } from './experience.jsx'
import { ReferenceAbout, ReferenceProjects, ReferenceContact } from './reference-pages.jsx'

const description = 'Moreward Studio brings strategy, creativity, technology, media and systems together to help ambitious businesses get discovered, acquire the right customers and grow.'

function InternalHero({ index, label, title, copy, dark = false }) {
  return <section className={`studio-internal-hero${dark ? ' studio-internal-hero--dark' : ''}`}><div className="studio-wrap"><Label index={index}>{label}</Label><div className="studio-internal-hero__grid"><h1>{title}</h1><p>{copy}</p></div></div></section>
}

export function HomePage() {
  return <><Seo description={description} /><ExperienceHero /><DisciplineStrip /><ExperiencePoint /><ExperienceWork /><ExperienceCapabilities /><ExperienceProcess /><ExperienceWhy /><ExperienceFAQ /><ReferenceContact home /></>
}

export function CapabilitiesPage() {
  return <><Seo title="Capabilities" description="Explore Moreward Studio's six capabilities: Strategy, Brand & Creative, Growth & Acquisition, Digital Experience, Media & Experiences, and AI & Business Systems." /><InternalHero index="01 / 04" label="CAPABILITIES" title={<>The work is<br/><em>connected.</em></>} copy="Six disciplines, one shared view of the business. We bring the right capabilities together around the challenge, not a fixed package." /><ExperienceCapabilities /><section className="studio-chapters studio-section"><div className="studio-wrap"><Label index="02 / 04">THE DISCIPLINES</Label>{capabilities.map((item, i) => <article className="studio-chapter" key={item.slug}><span>0{i + 1}</span><div><h2>{item.name}</h2><p>{item.line}</p><div className="studio-chapter__services">{item.services.map(service => <span key={service}>{service}</span>)}</div></div><Link to="/capabilities/$slug" params={{ slug: item.slug }} aria-label={`Explore ${item.name}`}><Arrow /></Link></article>)}</div></section><ExperienceProcess /><ClosingFeature /></>
}

export function CapabilityPage() {
  const { slug } = useParams({ from: '/capabilities/$slug' })
  const item = capabilities.find(entry => entry.slug === slug)
  if (!item) return <NotFoundPage />
  const next = capabilities[(capabilities.indexOf(item) + 1) % capabilities.length]
  return <><Seo title={item.name} description={`${item.name} at Moreward Studio. ${item.line}`} /><InternalHero index={`0${capabilities.indexOf(item) + 1} / 06`} label="CAPABILITY" title={<>{item.name}<em>.</em></>} copy={item.line} /><section className="studio-detail studio-section"><div className="studio-wrap studio-detail__grid"><Label index="01 / THE ROLE">THE THINKING</Label><div><h2>Every discipline has a job. <em>Every decision has a consequence.</em></h2><p>{item.line} We shape the scope around the business objective and the people it needs to reach.</p></div></div></section><section className="studio-chapters studio-section"><div className="studio-wrap"><Label index="02 / THE WORK">WHAT IT CAN INCLUDE</Label>{item.services.map((service, i) => <div className="studio-service" key={service}><span>0{i + 1}</span><h2>{service}</h2></div>)}<p className="studio-chapters__note">The exact mix is defined around the project. These are areas of practice, not fixed packages.</p></div></section><section className="studio-next"><div className="studio-wrap"><span>NEXT CAPABILITY</span><Link to="/capabilities/$slug" params={{slug:next.slug}}>{next.name} <Arrow /></Link></div></section><ClosingFeature /></>
}

export function WorkPage() {
  return <><Seo title="Projects" description="Explore Moreward Studio's illustrative visual explorations across identity, campaigns and digital systems. No client work or results are claimed." /><ReferenceProjects /></>
}

export function ProjectPage() {
  const { slug } = useParams({ from: '/work/$slug' })
  const project = projects.find(entry => entry.slug === slug)
  if (!project) return <NotFoundPage />
  const next = projects[(projects.indexOf(project) + 1) % projects.length]
  return <><Seo title={project.title} description={`${project.title} — an illustrative ${project.category} direction from Moreward Studio. No client or result is claimed.`} /><section className="studio-project-page ref-project-detail"><div className="studio-wrap"><Link className="studio-back" to="/projects">← All projects</Link><Label index={project.number}>{project.category.toUpperCase()} / CONCEPT STUDY</Label><h1>{project.title}</h1><p>{project.descriptor}</p><img className="ref-project-detail__image" src={project.image} alt={project.imageAlt} /><div className="studio-project-page__caption"><span>ILLUSTRATIVE STUDY</span><span>NO CLIENT OR OUTCOME CLAIMED</span></div></div></section><section className="studio-detail studio-section"><div className="studio-wrap studio-detail__grid"><Label index="01 / IDEA">THE THINKING</Label><div><h2>Designed to make<br/><em>a difference.</em></h2><p>{project.story}</p></div></div></section><section className="studio-next"><div className="studio-wrap"><span>NEXT STUDY</span><Link to="/work/$slug" params={{slug:next.slug}}>{next.title} <Arrow /></Link></div></section><ClosingFeature /></>
}

export function AboutPage() {
  return <><Seo title="About" description="Meet Moreward Studio, a creative and technology practice connecting strategy, campaigns, media and systems to help businesses move forward." /><ReferenceAbout /><ExperienceWhy /><ReferenceContact home /></>
}

export function ContactPage() {
  return <><Seo title="Contact" description="Start a project with Moreward Studio. Tell us about your business, your audience and what you want to build next." /><ReferenceContact /><ExperienceFAQ /></>
}

export function LegalPage({ type }) {
  const privacy = type === 'privacy'
  return <><Seo title={privacy ? 'Privacy' : 'Terms'} description={`${privacy ? 'Privacy' : 'Terms'} information for Moreward Studio.`} /><InternalHero index="—" label={privacy ? 'PRIVACY' : 'TERMS'} title={<>{privacy ? 'Privacy' : 'Terms'}<em>.</em></>} copy="Pre-launch information for review." /><section className="studio-legal studio-section"><div className="studio-wrap"><h2>Pre-launch information</h2>{privacy ? <><p>This website has no account system, analytics integration or server-side contact form. The contact form prepares an email in your email app; the site does not store its answers.</p><p>The website currently loads typefaces from Google Fonts. The final privacy notice and contact details should be confirmed before production publication.</p></> : <><p>The material on this website describes Moreward Studio's approach and capabilities. Portfolio concepts are labelled and do not claim client work or measured results.</p><p>Commercial terms are agreed separately for each project. This page is a pre-launch draft.</p></>}<Action to="/contact" outline>Contact Moreward</Action></div></section></>
}

export function NotFoundPage() {
  return <><Seo title="Page not found" description="The requested Moreward Studio page could not be found." /><InternalHero index="404" label="PAGE NOT FOUND" title={<>This path goes<br/><em>nowhere.</em></>} copy="There is more to explore from the beginning." dark /><div className="studio-wrap studio-not-found"><Action to="/">Return home</Action></div></>
}
