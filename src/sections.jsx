import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

export const stages = [
  { title: 'Understand', description: 'Market, customer, competition and business.' },
  { title: 'Position', description: 'Clarify why the business matters and why customers should care.' },
  { title: 'Attract', description: 'Build attention through brand, content and creative.' },
  { title: 'Acquire', description: 'Turn attention into qualified demand.' },
  { title: 'Convert', description: 'Turn demand into customers.' },
  { title: 'Measure', description: 'Connect marketing activity to business outcomes.' },
  { title: 'Grow', description: 'Use intelligence to continuously improve performance.' },
]

export const capabilities = [
  { slug: 'strategy', title: 'Strategy', kicker: '01 / Find the right direction', description: 'Clear thinking before committed action.', services: 'Growth strategy · Go-to-market · Market and customer research · Competitive intelligence · Positioning · Brand strategy · Journey mapping · Acquisition strategy', focus: ['Market understanding', 'Positioning', 'Growth strategy', 'Customer journey', 'Go-to-market'], symbol: 'S' },
  { slug: 'brand-creative', title: 'Brand + Creative', kicker: '02 / Give it a reason to matter', description: 'Distinctive expression with a commercial purpose.', services: 'Identity · Campaigns · Creative direction · Content · Video and motion · Advertising · Websites · Landing pages · Sales decks · Digital experiences', focus: ['Brand identity', 'Campaigns', 'Content', 'Video and motion', 'Websites', 'Sales collateral'], symbol: 'B' },
  { slug: 'demand-acquisition', title: 'Demand + Customer Acquisition', kicker: '03 / Reach the right people', description: 'Attention that can become qualified opportunity.', services: 'Performance marketing · Meta · Google · YouTube · LinkedIn · Search · Display · Retargeting · Creators and influencers · Acquisition funnels', focus: ['Paid acquisition', 'Search', 'Social and video', 'LinkedIn', 'Content', 'Retargeting'], symbol: 'A' },
  { slug: 'conversion', title: 'Conversion', kicker: '04 / Make the next step count', description: 'A connected route from interest to customer.', services: 'Landing pages · Conversion optimisation · Lead qualification and scoring · CRM · WhatsApp workflows · Nurturing · Sales enablement · Conversion tracking', focus: ['Landing pages', 'Lead qualification', 'CRM workflows', 'Sales enablement', 'Follow-up', 'Conversion optimisation'], symbol: 'C' },
  { slug: 'intelligence', title: 'Intelligence', kicker: '05 / Learn what moves growth', description: 'Better decisions from meaningful evidence.', services: 'Analytics · Attribution · Lead quality · Customer behaviour · Funnel analysis · CAC · Channel performance · Revenue attribution · Reporting', focus: ['Analytics', 'Attribution', 'Customer intelligence', 'Reporting', 'AI-assisted optimisation', 'Performance insights'], symbol: 'I' },
]

export const industries = ['Financial Services', 'Healthcare', 'Technology', 'Education', 'Consumer', 'Professional Services', 'Real Estate', 'Hospitality', 'Lifestyle', 'Retail', 'B2B', 'Emerging Businesses']

export const approach = [
  ['Understand', 'Find the market reality, customer context and business ambition.'],
  ['Define', 'Set the position, priorities and measures that matter.'],
  ['Build', 'Create the work and the connected journey around it.'],
  ['Launch', 'Put the system into the market with care.'],
  ['Measure', 'See what people do and what the business gains.'],
  ['Optimise', 'Turn evidence into the next, better move.'],
]

export const principles = [
  ['Strategy before activity.', 'We start with the business objective, not a content calendar.'],
  ['Creative with a purpose.', 'Good creative should attract attention and move people toward action.'],
  ['Acquisition meets conversion.', 'Generating leads is not enough. We care about what happens after the lead.'],
  ['Data informs decisions.', 'Performance and customer intelligence guide better decisions.'],
  ['Technology amplifies growth.', 'Technology should make growth faster, smarter and more scalable.'],
  ['Built around outcomes.', 'The objective is meaningful business growth, not more marketing activity.'],
]

export const projects = [
  { slug: 'a-sharper-reason', category: 'Brand Strategy', title: 'A sharper reason to choose.', industry: 'Cross-industry concept', services: ['Research', 'Positioning', 'Brand system'], description: 'Positioning, identity and a clearer market story.', variant: 'position', overview: 'An illustrative project format for a business whose value is strong but whose market story needs sharper focus.', challenge: 'How might a business give the right customers a clearer reason to notice, understand and choose it?', approach: 'Start with market and customer context, define the difference that matters, then translate it into a coherent brand system.', execution: 'The example visual explores typographic clarity, restrained contrast and a directional identity language.' },
  { slug: 'attention-to-action', category: 'Customer Acquisition', title: 'From attention to action.', industry: 'Cross-industry concept', services: ['Demand strategy', 'Acquisition', 'Conversion'], description: 'Demand and conversion designed as one journey.', variant: 'acquire', overview: 'An illustrative project format showing how demand and conversion can be designed as one connected journey.', challenge: 'How can the first signal of interest become a more qualified conversation?', approach: 'Align audience, message, channel and next action before scaling activity.', execution: 'The example visual treats movement through the journey as a designed system rather than a collection of campaigns.' },
  { slug: 'connected-view', category: 'Growth Systems', title: 'A more connected view.', industry: 'Cross-industry concept', services: ['Measurement', 'Customer intelligence', 'Growth planning'], description: 'Measurement that informs the next move.', variant: 'systems', overview: 'An illustrative project format for connecting customer signals and commercial decisions.', challenge: 'What would a business learn if marketing, qualification and sales outcomes were viewed together?', approach: 'Define useful signals, map handoffs and create a simple measurement rhythm.', execution: 'The example visual uses a restrained data language to represent signal, decision and improvement.' },
]

export function Arrow({ diagonal = false }) { return <span aria-hidden="true" className="arrow">{diagonal ? '↗' : '→'}</span> }

export function Button({ href, children, secondary = false, light = false, className = '' }) {
  return <Link className={`button ${secondary ? 'button--secondary' : ''} ${light ? 'button--light' : ''} ${className}`} to={href}><span>{children}</span><Arrow diagonal /></Link>
}

export function SectionLabel({ number, children }) {
  return <div className="section-label"><span className="section-label__number">{number}</span><span>{children}</span></div>
}

export function SectionHeader({ number, label, title, intro, id }) {
  return <div className="section-heading" id={id} data-reveal>
    <SectionLabel number={number}>{label}</SectionLabel>
    <div className="section-heading__main"><h2>{title}</h2>{intro && <p>{intro}</p>}</div>
  </div>
}

export function HeroDiagram() {
  const ref = useRef(null)
  function move(event) {
    if (!ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--mouse-x', `${((event.clientX - rect.left) / rect.width - .5) * 14}px`)
    ref.current.style.setProperty('--mouse-y', `${((event.clientY - rect.top) / rect.height - .5) * 14}px`)
  }
  return <div ref={ref} className="hero-diagram" onPointerMove={move} onPointerLeave={() => { if (ref.current) { ref.current.style.setProperty('--mouse-x', '0px'); ref.current.style.setProperty('--mouse-y', '0px') } }} aria-label="A directional diagram connecting attention, intent, customer and revenue" role="img">
    <div className="hero-diagram__top"><span>CONNECTED GROWTH / 001</span><span>MOREWARD METHOD</span></div>
    <svg viewBox="0 0 540 510" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><pattern id="hero-grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M 54 0 L 0 0 0 54" fill="none" stroke="currentColor" strokeWidth=".7"/></pattern></defs>
      <rect width="540" height="510" fill="url(#hero-grid)" className="diagram-grid"/>
      <path className="diagram-guide" d="M44 380H486 M270 62V448"/>
      <path className="diagram-path" d="M74 350 C140 350 143 242 213 242 S300 295 347 185 S430 138 475 106"/>
      <path className="diagram-path diagram-path--motion" d="M74 350 C140 350 143 242 213 242 S300 295 347 185 S430 138 475 106"/>
      {[[74,350],[213,242],[347,185],[475,106]].map(([x,y], i) => <g key={i}><circle className="diagram-node-ring" cx={x} cy={y} r="15"/><circle className="diagram-node" cx={x} cy={y} r="4"/></g>)}
      <path d="M467 108l9-3-3 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="diagram-arrow"/>
    </svg>
    <div className="diagram-step diagram-step--one"><span>01</span> ATTENTION</div>
    <div className="diagram-step diagram-step--two"><span>02</span> INTENT</div>
    <div className="diagram-step diagram-step--three"><span>03</span> CUSTOMER</div>
    <div className="diagram-step diagram-step--four"><span>04</span> REVENUE</div>
    <div className="hero-diagram__bottom"><span>FROM FIRST SIGNAL</span><span>TO BUSINESS MOMENTUM <Arrow /></span></div>
  </div>
}

export function Hero() {
  return <section id="top" className="hero">
    <div className="hero__grain" aria-hidden="true"></div>
    <div className="hero__inner container">
      <div className="hero__content"><div className="eyebrow hero__eyebrow"><span className="eyebrow-line"></span> MOREWARD STUDIO <span className="eyebrow-index">/ GROWTH BY DESIGN</span></div>
        <h1 className="hero__headline"><span>Growth,</span><span>designed to move</span><span>businesses <em>forward.</em></span></h1>
        <div className="hero__lower"><p>We combine strategy, brand, creative, customer acquisition and technology to help ambitious businesses get discovered, acquire the right customers and grow.</p><div className="hero__actions"><Button href="/contact">Start a conversation</Button><Button href="/capabilities" secondary>Explore our capabilities</Button></div></div>
      </div>
      <HeroDiagram />
    </div>
    <div className="hero__foot container"><span>SCROLL TO EXPLORE <span className="scroll-line"></span></span><span>STRATEGY / CREATIVE / ACQUISITION / INTELLIGENCE</span></div>
  </section>
}

export function Beyond() {
  const [active, setActive] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const progress = Math.max(0, Math.min(1, (window.innerHeight * .7 - rect.top) / (rect.height + window.innerHeight * .2)))
      setActive(Math.min(3, Math.floor(progress * 4)))
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return <section ref={ref} className="beyond section-light" id="beyond"><div className="container beyond__grid">
    <SectionLabel number="01">BEYOND MARKETING</SectionLabel>
    <div className="beyond__body"><h2 data-reveal>We don't just create marketing. <em>We build systems that generate and convert demand.</em></h2><div className="beyond__copy" data-reveal><p>Attention is a starting point.<br/>Demand needs direction.<br/>Opportunity needs a next step.<br/><strong>Growth asks for the whole journey.</strong></p><p>Moreward connects strategy, positioning, creative, demand generation, customer acquisition, conversion and intelligence into one connected system.</p></div>
      <div className="beyond__words" aria-label="Attention, Intent, Customers, Revenue">{['Attention.', 'Intent.', 'Customers.', 'Revenue.'].map((word, i) => <span key={word} className={i <= active ? 'is-active' : ''}>{word}</span>)}</div>
    </div>
  </div></section>
}

export function GrowthSystem() {
  const [active, setActive] = useState(0)
  const refs = useRef([])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(Number(entry.target.dataset.index)) })
    }, { rootMargin: '-38% 0px -48% 0px' })
    refs.current.forEach(node => node && observer.observe(node))
    return () => observer.disconnect()
  }, [])
  return <section className="growth section-dark" id="growth-system"><div className="container"><SectionHeader number="02" label="THE MOREWARD SYSTEM" title={<>The Moreward<br/><em>Growth System.</em></>} intro="A connected path from understanding the business to improving what happens next." />
    <div className="growth__grid"><div className="growth__visual"><div className="growth__visual-inner"><span className="growth__visual-kicker">A SYSTEM FOR MOVEMENT</span><div className="growth__giant-number">0{active + 1}<span>/ 07</span></div><div className="growth__diagram"><div className="growth__diagram-line"><div style={{ width: `${((active + 1) / stages.length) * 100}%` }}></div></div>{stages.map((item, i) => <span key={item.title} className={i <= active ? 'is-active' : ''}>{String(i + 1).padStart(2, '0')}</span>)}</div><p><span className="growth__visual-arrow">↗</span> {stages[active].title.toUpperCase()} <span className="growth__visual-sub">/ NEXT MOVEMENT</span></p></div></div>
      <div className="growth__steps">{stages.map((item, i) => <article ref={node => refs.current[i] = node} data-index={i} className={`growth-step ${active === i ? 'is-active' : ''}`} key={item.title}><span className="growth-step__number">{String(i + 1).padStart(2, '0')}</span><div><h3>{item.title}</h3><p>{item.description}</p></div><Arrow diagonal /></article>)}</div>
    </div></div></section>
}

export function CapabilityDetail({ item, index, mobile = false }) {
  return <div className={`capability-detail ${mobile ? 'capability-detail--mobile' : 'capability-detail--desktop'}`} aria-live="polite"><div className="capability-detail__top"><span>{item.kicker}</span><span>MOREWARD / {String(index + 1).padStart(2, '0')}</span></div><div className="capability-detail__symbol" aria-hidden="true">{item.symbol}<span>↗</span></div><div className="capability-detail__bottom"><h3>{item.description}</h3><p>{item.services}</p></div></div>
}

export function Capabilities() {
  const [active, setActive] = useState(0)
  return <section className="capabilities section-light" id="capabilities"><div className="container"><SectionHeader number="03" label="CAPABILITIES" title={<>Everything growth needs.<br/><em>Nothing it doesn't.</em></>} />
    <div className="capabilities__grid"><div className="capabilities__list">{capabilities.map((item, i) => <div key={item.title}><button type="button" className={`capability ${active === i ? 'is-active' : ''}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} aria-expanded={active === i}><span className="capability__index">0{i + 1}</span><span className="capability__title">{item.title}</span><Arrow diagonal /></button>{active === i && <CapabilityDetail item={item} index={i} mobile />}</div>)}</div>
      <CapabilityDetail item={capabilities[active]} index={active} />
    </div></div></section>
}

export function Industries() {
  return <section className="industries section-cream" id="industries"><div className="container"><SectionHeader number="04" label="WHO WE WORK WITH" title={<>Built for businesses<br/>with <em>somewhere to go.</em></>} intro="We work with ambitious businesses that want marketing to contribute to real growth." /><div className="industries__grid">{industries.map((item, i) => <div key={item} className="industry" data-reveal><span>{String(i + 1).padStart(2, '0')}</span><strong>{item}</strong><span aria-hidden="true">↗</span></div>)}</div><div className="industries__foot"><span>INDUSTRY-AGNOSTIC BY DESIGN</span><span>ONE CONNECTED GROWTH DISCIPLINE</span></div></div></section>
}

export function Approach() {
  const [active, setActive] = useState(0)
  const refs = useRef([])
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(Number(entry.target.dataset.index)) }), { rootMargin: '-32% 0px -45% 0px' })
    refs.current.forEach(node => node && observer.observe(node))
    return () => observer.disconnect()
  }, [])
  return <section className="approach section-dark" id="approach"><div className="container"><SectionHeader number="05" label="APPROACH" title={<>Strategy before<br/><em>execution.</em></>} intro="The work moves in a deliberate sequence. Each stage makes the next more useful." /><div className="approach__line"><span style={{ width: `${((active + 1) / approach.length) * 100}%` }}></span></div><div className="approach__steps">{approach.map(([title, text], i) => <article key={title} data-index={i} ref={node => refs.current[i] = node} className={`approach-step ${i <= active ? 'is-active' : ''}`}><span className="approach-step__number">0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
}

export function WhyMoreward() {
  return <section className="why section-light" id="why"><div className="container"><SectionHeader number="06" label="WHY MOREWARD" title={<>Different<br/><em>by design.</em></>} /><div className="why__grid">{principles.map(([title, text], i) => <article className="principle" key={title} data-reveal><span>0{i + 1} / PRINCIPLE</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
}

export function ProjectVisual({ variant }) {
  return <div className={`project-visual project-visual--${variant}`} aria-hidden="true">
    {variant === 'position' && <><span className="project-visual__micro">THE RIGHT REASON / 001</span><div className="project-visual__position">Clarity<span>creates</span>movement.</div><div className="project-visual__axis"></div></>}
    {variant === 'acquire' && <><span className="project-visual__micro">THE CONNECTED JOURNEY / 002</span><div className="project-visual__orbit"><i></i><i></i><i></i><i></i><div>ATTENTION<br/>TO ACTION</div></div></>}
    {variant === 'systems' && <><span className="project-visual__micro">INTELLIGENCE IN MOTION / 003</span><div className="project-visual__bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span className="project-visual__measure">SIGNAL → DECISION → GROWTH</span></>}
  </div>
}

export function Work() {
  return <section className="work section-cream" id="work"><div className="container"><SectionHeader number="07" label="SELECTED WORK" title={<>Selected <em>work.</em></>} intro="Brands, campaigns and growth systems built to move businesses forward." /><div className="work__notice"><span className="work__notice-dot"></span> Case studies will appear here as work becomes available. The formats below are illustrative.</div><div className="work__grid">{projects.map((item, i) => <article className={`project ${i === 0 ? 'project--large' : ''}`} key={item.title} data-reveal><ProjectVisual variant={item.variant}/><div className="project__meta"><span>{item.category.toUpperCase()} / CONCEPT FORMAT</span><span>0{i + 1}</span></div><div className="project__title"><h3>{item.title}</h3><Arrow diagonal /></div><p>{item.description}</p></article>)}</div><div className="work__categories"><span>FUTURE CASE STUDY AREAS</span><p>Brand Strategy <b>·</b> Campaigns <b>·</b> Customer Acquisition <b>·</b> Digital Experience <b>·</b> Growth Systems</p></div></div></section>
}

export function Future() {
  const futureItems = ['Lead intelligence', 'AI-assisted qualification', 'Customer intelligence', 'Automated workflows', 'Attribution', 'AI reporting', 'Predictive recommendations', 'Campaign intelligence', 'Sales assistance', 'Growth dashboards']
  return <section className="future section-dark" id="future"><div className="container"><SectionHeader number="08" label="FUTURE DIRECTION" title={<>Beyond <em>campaigns.</em></>} intro="We are building toward a technology-enabled growth system that connects the full commercial journey." /><div className="future__grid"><div className="future__flow"><div className="future__flow-header"><span>CONNECTED SYSTEM / FUTURE DIRECTION</span><span>↘</span></div>{['Marketing', 'Leads', 'CRM', 'Sales', 'Revenue', 'Intelligence'].map((item, i) => <div key={item} className="future__flow-row"><span>0{i + 1}</span><strong>{item}</strong><span>{i < 5 ? '↓' : '↗'}</span></div>)}</div><div className="future__aside"><span className="future__aside-label">WHAT COULD COME NEXT</span><p>We see a future where each customer signal helps inform the next decision.</p><div className="future__tags">{futureItems.map(item => <span key={item}>{item}</span>)}</div><small>Future direction only. These capabilities are not presented as live products or current systems.</small></div></div></div></section>
}

export function About() {
  return <section className="about section-light" id="about"><div className="container"><SectionHeader number="09" label="ABOUT MOREWARD" title={<>We believe marketing<br/>should <em>move the business.</em></>} /><div className="about__grid"><div className="about__mark" aria-hidden="true"><span>MORE</span><span>WARD↗</span></div><div className="about__copy" data-reveal><p className="about__lead">Moreward Studio is a growth and customer acquisition company built around one simple belief: marketing should contribute to business momentum.</p><p>We bring strategy, positioning, brand, creative, demand generation, conversion and intelligence together so businesses can build a more connected path from attention to revenue.</p><p>We are not interested in producing more marketing for the sake of producing more marketing. We want to build systems that make businesses more discoverable, more relevant and easier to choose.</p><p className="about__last">Moreward exists for businesses that want to move forward.</p></div></div></div></section>
}

export function Contact() {
  const [status, setStatus] = useState('')
  function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const data = new FormData(form)
    const lines = [
      'Hello Moreward Studio,', '',
      'I would like to discuss the next stage of growth.', '',
      ...[['Name', 'name'], ['Company', 'company'], ['Email', 'email'], ['What we want to achieve', 'goal'], ['Budget or timeline', 'requirement']].map(([label, key]) => `${label}: ${data.get(key) || 'Not provided'}`),
    ]
    const url = `mailto:sujay@nidhivriddhi.com?subject=${encodeURIComponent(`Moreward Studio enquiry — ${data.get('company')}`)}&body=${encodeURIComponent(lines.join('\n'))}`
    window.location.href = url
    setStatus('Your email app should open with your message ready to send.')
  }
  return <section className="contact section-dark" id="contact"><div className="contact__ambient" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div className="container contact__content">
    <SectionHeader number="04" label="START A CONVERSATION" title={<>Let's move<br/><em>something forward.</em></>} intro="Tell us where the business is, where you want it to go and what is standing in the way." />
    <div className="contact__grid"><div className="contact__aside"><div className="contact__aside-line"><span>01</span><span>THE AMBITION</span></div><div className="contact__aside-line"><span>02</span><span>THE OPPORTUNITY</span></div><div className="contact__aside-line"><span>03</span><span>THE NEXT MOVE</span></div><p>A useful conversation begins with the real business challenge. Share the context that matters.</p></div>
      <form className="contact-form" onSubmit={submit}><div className="contact-form__row"><label>Name <span>*</span><input name="name" type="text" autoComplete="name" placeholder="Your name" required /></label><label>Company <span>*</span><input name="company" type="text" autoComplete="organization" placeholder="Company name" required /></label></div><label>Work Email <span>*</span><input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label><label>What are you looking to achieve? <span>*</span><textarea name="goal" rows="5" placeholder="Tell us about the opportunity, challenge or next stage." required></textarea></label><label>Optional budget or timeline<input name="requirement" type="text" placeholder="Share what is useful to know" /></label><div className="contact-form__submit"><button type="submit" className="button"><span>Start a conversation</span><Arrow diagonal /></button><p>This opens your email app with your answers prepared. Nothing is stored on the website.</p></div>{status && <p className="contact-form__status" role="status">{status}</p>}</form>
    </div>
  </div></section>
}
