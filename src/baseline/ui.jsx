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

export function TextLink({ to, hash, href, children, className = '' }) {
  const classes = 'b-text-link ' + className
  return href ? <a className={classes} href={href}>{children}</a> : <Link className={classes} to={to} hash={hash}>{children}</Link>
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

// Brand glyphs for the studio's social profiles (simple-icons, CC0), drawn in currentColor.
const socialPaths = {
  Instagram: 'M7.03.084c-1.277.06-2.149.264-2.91.563a5.9 5.9 0 0 0-2.124 1.388a5.9 5.9 0 0 0-1.38 2.127C.321 4.926.12 5.8.064 7.076s-.069 1.688-.063 4.947s.021 3.667.083 4.947c.061 1.277.264 2.149.563 2.911c.308.789.72 1.457 1.388 2.123a5.9 5.9 0 0 0 2.129 1.38c.763.295 1.636.496 2.913.552c1.278.056 1.689.069 4.947.063s3.668-.021 4.947-.082c1.28-.06 2.147-.265 2.91-.563a5.9 5.9 0 0 0 2.123-1.388a5.9 5.9 0 0 0 1.38-2.129c.295-.763.496-1.636.551-2.912c.056-1.28.07-1.69.063-4.948c-.006-3.258-.02-3.667-.081-4.947c-.06-1.28-.264-2.148-.564-2.911a5.9 5.9 0 0 0-1.387-2.123a5.9 5.9 0 0 0-2.128-1.38c-.764-.294-1.636-.496-2.914-.55C15.647.009 15.236-.006 11.977 0S8.31.021 7.03.084m.14 21.693c-1.17-.05-1.805-.245-2.228-.408a3.7 3.7 0 0 1-1.382-.895a3.7 3.7 0 0 1-.9-1.378c-.165-.423-.363-1.058-.417-2.228c-.06-1.264-.072-1.644-.08-4.848c-.006-3.204.006-3.583.061-4.848c.05-1.169.246-1.805.408-2.228c.216-.561.477-.96.895-1.382a3.7 3.7 0 0 1 1.379-.9c.423-.165 1.057-.361 2.227-.417c1.265-.06 1.644-.072 4.848-.08c3.203-.006 3.583.006 4.85.062c1.168.05 1.804.244 2.227.408c.56.216.96.475 1.382.895s.681.817.9 1.378c.165.422.362 1.056.417 2.227c.06 1.265.074 1.645.08 4.848c.005 3.203-.006 3.583-.061 4.848c-.051 1.17-.245 1.805-.408 2.23c-.216.56-.477.96-.896 1.38a3.7 3.7 0 0 1-1.378.9c-.422.165-1.058.362-2.226.418c-1.266.06-1.645.072-4.85.079s-3.582-.006-4.848-.06m9.783-16.192a1.44 1.44 0 1 0 1.437-1.442a1.44 1.44 0 0 0-1.437 1.442M5.839 12.012a6.161 6.161 0 1 0 12.323-.024a6.162 6.162 0 0 0-12.323.024M8 12.008A4 4 0 1 1 12.008 16A4 4 0 0 1 8 12.008',
  LinkedIn: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037c-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85c3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.06 2.06 0 0 1-2.063-2.065a2.064 2.064 0 1 1 2.063 2.065m1.782 13.019H3.555V9h3.564zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z',
  Facebook: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978c.401 0 .955.042 1.468.103a9 9 0 0 1 1.141.195v3.325a9 9 0 0 0-.653-.036a27 27 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.7 1.7 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103l-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647',
}
export function SocialIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="b-social-icon"><path d={socialPaths[name]}/></svg>
}
