import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { capabilities } from './data.js'
import { Eyebrow, ResponsiveImage } from './ui.jsx'

// Capabilities "The disciplines": a dark section with an accordion on the right. The open discipline
// becomes a light card (description, services, link); the counter and image on the left follow it.
export function Disciplines() {
  const [open, setOpen] = useState(0)
  const current = capabilities[open] || capabilities[0]
  return <section className="b-disc b-panel-dark" aria-labelledby="disciplines-title">
    <div className="b-disc__head">
      <Eyebrow light>The disciplines</Eyebrow>
      <h2 id="disciplines-title" className="b-disc__lead">Three disciplines working from one brief: <span>the idea, the media that carries it and the systems behind it.</span></h2>
      <Link to="/contact" className="b-disc__head-link">Start a project <span aria-hidden="true">↘</span></Link>
    </div>
    <div className="b-disc__body">
      <div className="b-disc__aside" aria-hidden="true">
        <p className="b-disc__count"><span key={open}>({current.number})</span></p>
        <div className="b-disc__visual">
          <p key={'l' + open}>{current.name}</p>
          <div className="b-disc__frames">{capabilities.map((item, i) => <div key={item.slug} className={'b-disc__frame' + (i === open ? ' is-active' : '')}><ResponsiveImage image={item.visual} alt="" sizes="(max-width: 900px) 0px, 34vw"/></div>)}</div>
        </div>
      </div>
      <div className="b-disc__list">
        {capabilities.map((item, i) => {
          const isOpen = i === open
          return <article key={item.slug} className={'b-disc__item' + (isOpen ? ' is-open' : '')}>
            <h3><button type="button" id={'disc-' + item.slug} aria-expanded={isOpen} aria-controls={'disc-panel-' + item.slug} onClick={() => setOpen(isOpen ? -1 : i)}>
              <span>{item.name}</span><i aria-hidden="true"/>
            </button></h3>
            <div className="b-disc__panel" id={'disc-panel-' + item.slug} role="region" aria-labelledby={'disc-' + item.slug}>
              <div className="b-disc__panel-inner">
                <div className="b-disc__mobile-visual" aria-hidden="true"><ResponsiveImage image={item.visual} alt="" sizes="(max-width: 900px) 100vw, 0px"/></div>
                <div className="b-disc__text"><p>{item.hubBody}</p><Link to={'/capabilities/' + item.slug} tabIndex={isOpen ? 0 : -1}>Explore {item.name} <span aria-hidden="true">↗</span></Link></div>
                <ul aria-label={item.name + ' services'}>{item.homeServices.map(service => <li key={service}>{service}</li>)}</ul>
              </div>
            </div>
          </article>
        })}
      </div>
    </div>
  </section>
}
