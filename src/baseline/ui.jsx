import { Link } from '@tanstack/react-router'
import { track } from '@vercel/analytics'
import { STUDIO_EMAIL } from '../config/site.js'
import { useSpringArrow } from './spring.js'

export function trackEvent(name, properties) {
  if (typeof window !== 'undefined') {
    try { track(name, properties) } catch { /* Analytics is optional in local preview. */ }
  }
}

export function Arrow({ diagonal = false }) {
  const ref = useSpringArrow()
  return <span ref={ref} className="b-arrow" aria-hidden="true">{diagonal ? '↗' : '→'}</span>
}

// `index` (e.g. "02 / 05") is accepted but no longer shown: section counters read as decoration, not information.
export function Eyebrow({ children, light = false }) {
  return <p className={'b-eyebrow' + (light ? ' b-eyebrow--light' : '')}><span className="b-eyebrow__dot" aria-hidden="true"/><span>{children}</span></p>
}

export function TextLink({ to, href, children, className = '' }) {
  const classes = 'b-text-link ' + className
  return href ? <a className={classes} href={href}>{children}</a> : <Link className={classes} to={to}>{children}</Link>
}

export function ConversionLink({ to = '/contact', children = 'Start a project', location = 'band', service, light = false, active = false, className = '' }) {
  const clicked = () => {
    trackEvent('cta_start_project', { location })
    if (service) trackEvent('discipline_cta', { service })
  }
  return <Link to={to} onClick={clicked} aria-current={active ? 'page' : undefined} className={'b-pill' + (light ? ' b-pill--light' : '') + (active ? ' is-current' : '') + ' ' + className}><span>{children}</span></Link>
}

export function EmailLink({ subject, body, children = STUDIO_EMAIL, className = '' }) {
  const suffix = subject ? '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body || '') : ''
  return <a href={'mailto:' + STUDIO_EMAIL + suffix} className={className} onClick={() => trackEvent('email_click')}>{children}</a>
}

export function RevealWords({ text, as: Tag = 'h2', className = '', delay = 0 }) {
  const words = text.split(/\s+/)
  return <Tag className={'b-word-reveal ' + className} data-reveal={Tag === 'h1' ? undefined : ''} aria-label={text} tabIndex={Tag === 'h1' ? -1 : undefined}>{words.map((word, i) => <span className="b-word-clip" key={word + '-' + i} aria-hidden="true"><span style={{ '--word-delay': delay + i * 60 + 'ms' }}>{word}{i < words.length - 1 ? ' ' : ''}</span></span>)}</Tag>
}

export function ResponsiveImage({ image, alt, sizes = '100vw', eager = false, className = '' }) {
  if (image.placeholder) return <picture className={'b-placeholder ' + className} data-placeholder={image.label}><img src={image.src} alt="" width={image.width} height={image.height} decoding="async"/></picture>
  const widths = [...new Set([Math.min(480, image.width), Math.min(960, image.width), image.width])]
  const srcSet = ext => widths.map(width => '/images/' + image.id + '-' + width + '.' + ext + ' ' + width + 'w').join(', ')
  return <picture className={className}>
    <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes}/>
    <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes}/>
    <img src={image.src} alt={alt} width={image.width} height={image.height} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined}/>
  </picture>
}

export function ImageFrame({ image, alt, className = '', sizes = '100vw', eager = false }) {
  return <div className={'b-image-frame ' + className} data-reveal><ResponsiveImage image={image} alt={alt} sizes={sizes} eager={eager}/></div>
}

export function StudyCard({ project, summary = false, className = '', eager = false }) {
  const inner = <>
    <div className="b-project__image"><ResponsiveImage image={project.image} alt={project.imageAlt} sizes="(max-width: 767px) 100vw, 50vw" eager={eager}/></div>
    <div className="b-project__meta"><div><span>{project.client ? project.number : 'Study ' + project.number}</span><h3>{project.title}</h3></div>{project.category && <span>{project.category}</span>}</div>
    {summary && <p className="b-project__summary">{project.summary}</p>}
  </>
  const props = { className: 'b-project ' + className, 'data-reveal': eager ? undefined : '' }
  // Standalone pages (e.g. client case studies in /public) need a full page load, not client-side routing.
  return project.href ? <a href={project.href} {...props}>{inner}</a> : <Link to={'/work/' + project.slug} {...props}>{inner}</Link>
}

export function Breadcrumb({ parent, parentTo, current }) {
  return <nav className="b-breadcrumb" aria-label="Breadcrumb"><ol><li><Link to={parentTo}>{parent}</Link></li><li aria-hidden="true">/</li><li aria-current="page">{current}</li></ol></nav>
}

export function NextNavigation({ type, title, to, href, allLabel, allTo }) {
  const content = <>{title}<Arrow diagonal/></>
  return <section className="b-next-project b-panel-light"><div><Eyebrow>{type}</Eyebrow>{href ? <a className="b-next-project__title" href={href}>{content}</a> : <Link className="b-next-project__title" to={to}>{content}</Link>}</div><TextLink to={allTo}>{allLabel}</TextLink></section>
}

export function CtaBand({ variant = 'default', capability }) {
  const studio = variant === 'studio'
  const service = capability?.slug
  const label = capability ? 'Start a ' + capability.name + ' project' : 'Start a project'
  const to = service ? '/contact?service=' + service : '/contact'
  return <section className={'b-cta-band b-panel-dark' + (studio ? ' b-cta-band--studio' : '')} data-reveal>
    <Eyebrow light>{studio ? 'Moreward' : 'Have something in mind?'}</Eyebrow>
    <RevealWords text={studio ? 'Not more work. More of what matters.' : "Let's give it direction."}/>
    <div>{!studio && <p>Bring us the problem. We'll help shape what happens next.</p>}
      <ConversionLink to={to} service={service} location={service ? 'discipline-band' : 'band'} light>{studio ? 'Start a project' : label}</ConversionLink>
    </div>
  </section>
}
