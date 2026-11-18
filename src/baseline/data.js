const image = (id, width, height) => ({ src: `/images/${id}-${width}.webp`, id, width, height })

// Labelled stand-in for an image that hasn't been supplied yet. Rendered by ResponsiveImage.
// To fill a slot: add the files to public/images and replace placeholder(...) with image(...).
const placeholder = (label, width, height) => {
  // A quiet brand-colour field (deep teal with a soft aqua glow) so an empty slot still looks finished.
  // The glow position varies with the label so neighbouring slots don't look identical.
  const seed = [...label].reduce((sum, c) => sum + c.charCodeAt(0), 0)
  const gx = 20 + (seed % 60), gy = 15 + ((seed >> 3) % 55)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g" cx="${gx}%" cy="${gy}%" r="85%"><stop offset="0" stop-color="#2f8f8c"/><stop offset=".38" stop-color="#0f4a50"/><stop offset="1" stop-color="#061c22"/></radialGradient><radialGradient id="s" cx="${100 - gx}%" cy="${100 - gy / 2}%" r="60%"><stop offset="0" stop-color="#5AC9C7" stop-opacity=".22"/><stop offset="1" stop-color="#5AC9C7" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#s)"/><circle cx="${width * (gx / 100)}" cy="${height * (gy / 100)}" r="${Math.min(width, height) * .42}" fill="none" stroke="#A8E5E2" stroke-opacity=".14" stroke-width="1.5"/><circle cx="${width * (gx / 100)}" cy="${height * (gy / 100)}" r="${Math.min(width, height) * .62}" fill="none" stroke="#A8E5E2" stroke-opacity=".07" stroke-width="1.5"/></svg>`
  return { placeholder: true, label, width, height, src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) }
}

// Hands for the home contact section (see home-contact.jsx). Set to { left: '/images/hand-left.webp', right: '/images/hand-right.webp' }
// once the two images are in public/images. null shows the fine-line stand-in.
// Hands cut from Michelangelo's Creation of Adam (public domain), toned to monochrome.
export const contactHands = { left: '/images/hand-left.webp', right: '/images/hand-right.webp' }

export const imagery = {
  creative: image('creative-tree', 1254, 1254),
  advertising: placeholder('Advertising & Media', 1040, 1300),
  technology: placeholder('Technology & Automation', 1040, 1300),
  howWeWork: placeholder('Home · How we work', 1040, 1300),
}

export const navigation = [
  { label: 'Work', to: '/work' },
  { label: 'Capabilities', to: '/capabilities' },
  { label: 'Contact', to: '/contact' },
]

export const projects = [
  {
    number: '01', slug: 'betach', title: 'BETACH', client: true, href: '/work/betach',
    summary: 'Protection, built on trust.',
    intro: 'An identity for a Gulf consultancy in safety leadership and specialist talent, where trust and protection share one form.',
    facts: [['Client', 'BETACH Consulting Services'], ['Sector', 'Safety leadership & talent'], ['Region', 'Gulf (GCC)'], ['Discipline', 'Brand identity']],
    image: image('betach-plate', 1254, 1254), imageAlt: 'A hand holding a clear acrylic plate etched with the BETACH symbol, against a teal gradient',
  },
  {
    number: '02', slug: 'kriya-setu', title: 'Kriya Setu', client: true, href: '/work/kriya-setu',
    summary: 'Brand identity for an experiential learning platform. Bridging knowledge and real competence.',
    intro: 'Brand identity for an experiential learning platform that moves classrooms from memorising to understanding.',
    facts: [['Client', 'Kriya Setu'], ['Sector', 'Ed-tech, experiential learning'], ['Audience', 'Institutions, teachers, students'], ['Discipline', 'Brand identity']],
    image: image('kriya-setu-chrome', 1300, 743), imageAlt: 'The Kriya Setu mark rendered in polished chrome with an orange spark, on black',
  },
  {
    number: '03', slug: 'rucaa', title: 'Rucaa', client: true, href: '/work/rucaa',
    summary: 'A fashion marketplace for authentic Make in India brands, and an identity drawn from the butterfly.',
    intro: 'A fashion marketplace for authentic Make in India brands, and an identity drawn from the butterfly.',
    facts: [['Client', 'Rucaa'], ['Sector', 'Fashion & apparel e-commerce'], ['Market', 'India'], ['Discipline', 'Brand identity']],
    image: image('rucaa-pin', 1122, 902), imageAlt: 'A gold Rucaa R pin on the lapel of a dark tweed jacket',
  },
]

export const capabilities = [
  {
    number: '01', slug: 'creative-marketing', name: 'Creative & Marketing', title: 'Make the idea matter.',
    homeDescription: 'Strategy, identity, campaigns and content that give a brand something clear to say.',
    homeServices: ['Marketing Strategy', 'Brand Identity', 'Advertising Design', 'Campaign Development', 'Influencer Marketing', 'Content Creation'],
    hubBody: 'Positioning, identity, advertising design, campaigns, creator partnerships and content. The thinking that decides what a brand says and how it looks saying it.',
    samples: ['Marketing strategy', 'Brand identity', 'Campaign development', 'Content production'],
    heroBody: 'Positioning, identity, campaigns and content, shaped around what the business actually needs to change.',
    thinkingTitle: 'A strong idea starts with a clear reason to exist.',
    thinkingBody: 'Before anything is designed, we work out what the brand stands for, who it is for and what it needs people to do.',
    sections: [
      ['Find the angle.', 'Strategy starts with the audience, the market and the one thing the business needs to move.'],
      ['Make it distinctive.', 'Identity and advertising design give the idea a look and a voice people recognise at every touchpoint.'],
      ['Put it to work.', 'Campaigns, creator partnerships and content carry the idea to the people it was made for.'],
    ],
    services: ['Marketing strategy', 'Brand identity', 'Advertising design', 'Campaign development', 'Influencer and creator marketing', 'Content production'],
    visual: imagery.creative, visualAlt: 'A lone figure stands before a wall of glowing teal lines branching like a tree from a single point of light',
    relatedSlug: 'betach',
  },
  {
    number: '02', slug: 'advertising-media', name: 'Advertising & Media', title: 'Take the message further.',
    homeDescription: 'Outdoor, metro, television, radio and print, planned so the work is seen where it counts.',
    homeServices: ['Outdoor Advertising', 'Billboard & Banner Advertising', 'Metro Advertising', 'Television Advertising', 'Radio Advertising', 'Print Advertising', 'Media Planning'],
    hubBody: 'Outdoor, billboard, metro, television, radio and print, with the media planning that decides where each piece runs and why.',
    samples: ['Outdoor and billboard', 'Metro and transit', 'Television and radio', 'Media planning'],
    heroBody: 'Outdoor, metro, television, radio and print. We plan where the work appears and make sure it earns its place there.',
    thinkingTitle: 'The right idea deserves the right place to be seen.',
    thinkingBody: 'Media is a creative decision. Where, when and how often a message appears shapes what people take away from it.',
    sections: [
      ['Seen in public.', 'Billboards, banners and metro formats put the brand where people pass every day, designed for distance and speed.'],
      ['Heard and remembered.', 'Television, radio and print, made for each format rather than resized to fit it.'],
      ['Planned with purpose.', 'Channel, audience, timing and budget, so every placement has a clear job to do.'],
    ],
    services: ['Outdoor advertising', 'Billboard and banner campaigns', 'Metro and transit advertising', 'Television advertising', 'Radio advertising', 'Print advertising', 'Media planning'],
    visual: imagery.advertising, visualAlt: '',
    relatedSlug: null,
  },
  {
    number: '03', slug: 'technology-automation', name: 'Technology & Automation', title: 'Build what the business runs on.',
    homeDescription: 'Websites, custom CRMs and AI automations that turn interest into enquiries, and enquiries into customers.',
    homeServices: ['AI Automations', 'Custom CRM Solutions', 'Workflow Automation', 'Website Design & Development', 'Technology-led Business Solutions'],
    hubBody: 'Websites, custom CRMs, workflow and AI automation. The systems that catch the attention a campaign creates and turn it into business.',
    samples: ['Website design and development', 'Custom CRM development', 'Workflow automation', 'AI automations'],
    heroBody: 'Websites, custom CRMs and AI automations that turn attention into enquiries, and enquiries into business.',
    thinkingTitle: 'Good marketing deserves a system that can catch it.',
    thinkingBody: 'Campaigns create interest. Without the right systems, much of it leaks away through slow replies, scattered spreadsheets and missed follow-ups.',
    sections: [
      ['Connect the journey.', 'A custom CRM links enquiry, action and outcome, so a team can see what is happening and what needs doing next.'],
      ['Design for use.', 'Websites and tools that are clear, fast and easy to act on, for customers and for the people running them.'],
      ['Make AI practical.', 'Automation takes on the repetitive work, so people can focus on the decisions that need them.'],
    ],
    services: ['AI automations', 'Custom CRM development', 'Workflow automation', 'Website design and development', 'Custom business tools'],
    visual: imagery.technology, visualAlt: '',
    relatedSlug: null,
  },
]

export const homeSteps = ['Understand', 'Define', 'Make', 'Launch and refine']

export const studioPrinciples = [
  ['Direction before decoration.', 'Know what the work has to do before deciding how it looks.'],
  ['Clarity over noise.', 'Say less, and make it count.'],
  ['Ideas deserve proper execution.', 'A good idea, badly made, is a missed opportunity.'],
  ['Creative and technology belong together.', 'The brand and the systems behind it should be built by people who talk to each other.'],
  ['Ambitious about the work. Honest about the claims.', 'We show what we have made, label what is self-initiated, and never invent the numbers.'],
]

export const studioSteps = [
  ['Understand', 'The business, the market, the audience and the real problem, which is not always the one in the brief.'],
  ['Define', 'A clear direction, agreed priorities and a scope everyone signs off before work begins.'],
  ['Make', 'The creative, media, digital or technology work, reviewed together at agreed points.'],
  ['Launch and refine', 'We put the work into the world, then refine it against what we agreed at the start.'],
]

export const engagementTypes = [
  ['Projects', 'A defined scope, timeline and outcome.'],
  ['Partnerships', 'Ongoing creative and marketing support, month to month.'],
  ['Campaigns', 'From the idea through media to launch.'],
  ['Technology builds', 'CRMs, automations, websites and digital tools.'],
  ['Integrated work', 'Several disciplines, one team and one plan.'],
]

// Home "Tools" system: the logomark at the centre, one orbit per capability (first = innermost), each
// carrying the tools that discipline works in. No tool appears on more than one orbit. Logos live in
// public/images/tools (official marks, from the CC0 gilbarbara/logos and simple-icons sets and MIT devicon).
export const toolOrbits = [
  { slug: 'creative-marketing', name: 'Creative & Marketing', line: 'Identity, campaigns and content.', tools: [
    { name: 'Adobe Illustrator', logo: 'illustrator' }, { name: 'Figma', logo: 'figma' },
    { name: 'Adobe After Effects', logo: 'after-effects' }, { name: 'Framer', logo: 'framer' }, { name: 'Canva', logo: 'canva' },
  ] },
  { slug: 'advertising-media', name: 'Advertising & Media', line: 'Planning, buying and measurement.', tools: [
    { name: 'Meta', logo: 'meta' }, { name: 'Google Ads', logo: 'google-ads' }, { name: 'Google Analytics', logo: 'google-analytics' },
    { name: 'LinkedIn Ads', logo: 'linkedin' }, { name: 'Display & Video 360', logo: 'dv360' },
  ] },
  { slug: 'technology-automation', name: 'Technology & Automation', line: 'AI, automation and the systems behind it.', tools: [
    { name: 'OpenAI', logo: 'openai' }, { name: 'Claude', logo: 'claude' }, { name: 'n8n', logo: 'n8n' }, { name: 'Make', logo: 'make' },
    { name: 'Zapier', logo: 'zapier' }, { name: 'Supabase', logo: 'supabase' }, { name: 'Vercel', logo: 'vercel' }, { name: 'HubSpot', logo: 'hubspot' },
  ] },
]

// Creative & Marketing page (/capabilities/creative-marketing). Copy approved by the studio; scope items
// are examples of what a project can include, not fixed packages.
export const creativeMarketing = {
  slug: 'creative-marketing', name: 'Creative & Marketing',
  chain: ['Strategy', 'Identity', 'Advertising', 'Campaigns', 'Creators', 'Content'],
  servicesTitle: 'Six services, one direction.',
  servicesIntro: 'Each can stand on its own or work with the others. The scope lists show what a project can include, not fixed packages; every project is scoped around what it needs.',
  hero: {
    eyebrow: 'Creative & Marketing', title: 'Make the idea matter.',
    body: 'Clear direction gives creative work a purpose. We help businesses decide what they need to say, build a distinctive way to say it, and carry that thinking through campaigns and content.',
    support: 'For launches, changing brands and businesses that need to communicate more clearly.',
  },
  view: {
    lead: 'First, know what the work needs to do.', follow: 'Then make it impossible to overlook.',
    body: 'Strategy sets the direction. Identity makes it recognisable. Advertising, campaigns, creators and content carry it into the world. Each part has a distinct job; together, they should express the same idea.',
  },
  services: [
    { id: 'marketing-strategy', name: 'Marketing Strategy', body: 'Before choosing channels or making assets, we establish what the marketing needs to achieve. We look at the audience, the market and the brand’s current position, then define the message and priorities that should guide the work.', scope: ['Audience and market review', 'Positioning', 'Messaging', 'Campaign objectives', 'Channel priorities', 'Marketing plan'] },
    { id: 'brand-identity', name: 'Brand Identity', body: 'An identity should help people recognise the brand and understand its character. We develop the visual and verbal elements as a system that can be used consistently, from prominent applications to everyday communication.', scope: ['Logo and identity development', 'Colour and typography', 'Visual direction', 'Brand voice', 'Key applications', 'Usage guidelines'] },
    { id: 'advertising-design', name: 'Advertising Design', body: 'Advertising needs to communicate quickly and clearly in the format where people encounter it. We develop the concept, words and visuals for an advertisement, then adapt the creative for the agreed formats and specifications.', scope: ['Advertising concepts', 'Headlines and copy', 'Key visuals', 'Layout design', 'Format adaptations'] },
    { id: 'campaign-development', name: 'Campaign Development', body: 'A campaign needs a central idea strong enough to hold together across multiple pieces of communication. We define that idea, develop its message and creative direction, and plan how the work should unfold.', scope: ['Campaign concept', 'Messaging', 'Creative direction', 'Content themes', 'Rollout plan', 'Campaign assets'] },
    { id: 'influencer-marketing', name: 'Influencer Marketing', body: 'The right creator brings a relevant perspective and an audience that fits the objective. We approach creator collaborations through fit, a clear brief and content that makes sense for both the brand and the creator.', scope: ['Creator research and selection', 'Collaboration briefs', 'Outreach', 'Content coordination', 'Approval stages', 'Review of agreed activity'] },
    { id: 'content-creation', name: 'Content Creation', body: 'Content should have a job to do. We plan and create material that explains an offer, supports a campaign or helps a brand communicate consistently over time.', scope: ['Content planning', 'Copywriting', 'Design', 'Social content', 'Agreed visual or video formats'], note: 'Format and volume are defined in the project scope.' },
  ],
  stepsTitle: 'From brief to usable work.',
  steps: [
    ['Understand the objective', 'Learn about the business, audience, existing material and what needs to change.'],
    ['Set the direction', 'Recommend the relevant services and agree on the approach, deliverables, timing and review points.'],
    ['Create and review', 'Develop the work against the agreed direction, with reviews at defined stages.'],
    ['Prepare it for use', 'Deliver the agreed final assets and guidance needed to apply them.'],
  ],
  engage: {
    title: 'A scope that fits the need.',
    body: 'Come to Moreward for one defined service, a project that combines several, or ongoing creative and marketing support. We establish the scope after understanding the problem. Every engagement has agreed deliverables, timing and review points.',
    options: [['One service', 'One defined service, scoped on its own.'], ['Combined project', 'A project that combines several services.'], ['Ongoing support', 'Ongoing creative and marketing support.']],
  },
  close: {
    eyebrow: 'Have something in mind?', title: 'Let’s give it direction.',
    body: 'Tell us what you are trying to achieve, what you have in place today and when you need to move. You do not need a finished brief to start the conversation.',
    button: 'Start a Creative & Marketing project',
  },
}

// Advertising & Media page (/capabilities/advertising-media). Same layout as Creative & Marketing.
// Moreward does not own media inventory; availability, rates and approvals sit with media providers.
export const advertisingMedia = {
  slug: 'advertising-media', name: 'Advertising & Media',
  chain: ['Outdoor', 'Billboard', 'Metro', 'Television', 'Radio', 'Print'],
  servicesTitle: 'Seven services, each with its own setting.',
  servicesIntro: 'Each format can run on its own or as part of a wider plan. The scope lists show what a project can include, not fixed packages; every project is scoped around its objective.',
  hero: {
    eyebrow: 'Advertising & Media', title: 'Take the message further.',
    body: 'Where an advertisement appears changes how it is seen, heard and remembered. We plan advertising around the audience, the message and the setting, then develop work suited to each selected format.',
    support: 'Across outdoor, metro, television, radio and print, with media planning that gives every placement a clear purpose.',
  },
  view: {
    lead: 'The right message deserves', follow: 'the right place to be seen.',
    body: 'A billboard, a metro station, a television break and a printed page ask different things of an idea. Effective advertising considers where people will encounter it, how much attention they can give it and what they should take away.',
  },
  services: [
    { id: 'outdoor-advertising', name: 'Outdoor Advertising', body: 'Public spaces create opportunities to reach people as they move through a city. We consider the audience, geography, viewing conditions and available formats before developing work for an outdoor setting.', scope: ['Location and format planning', 'Outdoor creative direction', 'Message and artwork adaptation', 'Production specifications', 'Placement coordination where agreed'] },
    { id: 'billboard-banner-advertising', name: 'Billboard & Banner Advertising', body: 'Large-format advertising has only a moment to communicate. We focus on a clear message, strong visual hierarchy and design that remains legible at the distance and speed of its intended placement.', scope: ['Billboard and banner concepts', 'Headlines and artwork', 'Size adaptations', 'Production-ready files', 'Coordination around selected sites and specifications'] },
    { id: 'metro-advertising', name: 'Metro Advertising', body: 'Metro environments offer different points of attention, from entrances and platforms to trains and station interiors. We plan for the route, the audience and the time people have to see the message.', scope: ['Station or route considerations', 'Format selection', 'Campaign creative', 'Artwork adaptations', 'Production requirements', 'Coordination with relevant media providers where agreed'] },
    { id: 'television-advertising', name: 'Television Advertising', body: 'Television brings together story, image, sound and timing. We shape the message for the viewing context and plan the creative and placement around the audience the campaign needs to reach.', scope: ['Commercial concept', 'Script and storyboard', 'Production coordination', 'Format versions', 'Channel and scheduling considerations'] },
    { id: 'radio-advertising', name: 'Radio Advertising', body: 'Radio depends on a message people can understand and remember without seeing it. We develop audio-led ideas with clear writing, purposeful sound and a format suited to the intended audience and station.', scope: ['Radio concept', 'Scriptwriting', 'Voice and audio direction', 'Production coordination', 'Duration versions', 'Station and scheduling considerations'] },
    { id: 'print-advertising', name: 'Print Advertising', body: 'Print gives an advertisement a physical context and a defined space. We design for the publication, the reader and the size of the placement, making the message work as both copy and composition.', scope: ['Publication and format considerations', 'Advertising copy', 'Layout and artwork', 'Size adaptations', 'Print-ready files', 'Publication coordination where agreed'] },
    { id: 'media-planning', name: 'Media Planning', body: 'Media planning determines where a campaign should appear, when it should run and how the available budget should be used. We assess channels and placements against the audience and the objective so the plan has a reason behind every choice.', scope: ['Audience and market considerations', 'Channel selection', 'Geographic priorities', 'Timing and frequency', 'Proposed budget allocation', 'Placement plan', 'Agreed approach to reviewing performance'] },
  ],
  stepsTitle: 'From brief to placement.',
  steps: [
    ['Understand the objective', 'Clarify the audience, market, message, timing and available budget.'],
    ['Plan the media', 'Recommend relevant channels and formats, then confirm placement requirements, availability and costs.'],
    ['Develop and prepare', 'Create or adapt the advertising work for the agreed formats and complete the required production checks.'],
    ['Launch and review', 'Coordinate the agreed release or placement, then review the activity against the objectives set at the start.'],
  ],
  engage: {
    title: 'A plan shaped around the audience.',
    body: 'Come to Moreward with one advertising format in mind, a campaign spanning several channels, or a need to work out where your message should appear. We define the scope after understanding the objective. The proposal should make the creative work, production requirements, media costs, approvals and responsibilities clear before anything is placed.',
    options: [['One format', 'One advertising format in mind.'], ['Multi-channel campaign', 'A campaign spanning several channels.'], ['Media planning', 'Working out where your message should appear.']],
    note: 'Media availability, rates, specifications and approvals depend on the market and the relevant media providers. We confirm these during planning.',
  },
  close: {
    eyebrow: 'Have something in mind?', title: 'Let’s give it direction.',
    body: 'Tell us who you need to reach, where you want to reach them and what you want the advertising to achieve. If you are unsure which format is right, start with the objective.',
    button: 'Start an Advertising & Media project',
  },
}

// Technology & Automation page (/capabilities/technology-automation). Same layout as the other two.
// Third-party platforms (hosting, CRM, AI and automation tools) run on the client's own accounts and terms.
export const technologyAutomation = {
  slug: 'technology-automation', name: 'Technology & Automation',
  chain: ['Website', 'Enquiry', 'CRM', 'Workflow', 'Automation', 'Reporting'],
  servicesTitle: 'Five services, one connected system.',
  servicesIntro: 'Each can be built on its own or connected to the others. The scope lists show what a project can include, not fixed packages; every project is scoped around how the business actually works.',
  hero: {
    eyebrow: 'Technology & Automation', title: 'Build what the business runs on.',
    body: 'Good marketing creates interest. The systems behind it decide what happens next. We design and build websites, CRMs and automations that help a business respond faster, stay organised and spend less time on repetitive work.',
    support: 'For businesses that have outgrown spreadsheets, scattered tools and manual follow-ups.',
  },
  view: {
    lead: 'Start with how the work actually happens.', follow: 'Then build the system around it.',
    body: 'Technology should fit the way a team works, not force the team to work around it. We map the process first, then choose what to build, what to connect and what to automate, so every part has a reason to exist.',
  },
  services: [
    { id: 'ai-automations', name: 'AI Automations', body: 'AI is useful when it takes on a defined task reliably. We identify where it can help, such as sorting enquiries, drafting replies or summarising information, and build it into the process with clear limits and a person in the loop where it matters.', scope: ['Use-case review', 'AI-assisted workflows', 'Enquiry sorting and drafting', 'Document and data summaries', 'Prompt and output testing', 'Human review steps'] },
    { id: 'custom-crm-solutions', name: 'Custom CRM Solutions', body: 'A CRM should show a team what is happening and what needs doing next. We design and build CRMs around the way the business handles enquiries, customers and follow-ups, rather than bending the business to fit a generic tool.', scope: ['Process mapping', 'Data structure', 'Pipeline and stages', 'Dashboards and views', 'Integrations with existing tools', 'Data migration', 'Team onboarding'] },
    { id: 'workflow-automation', name: 'Workflow Automation', body: 'Repetitive work slows a team down and invites mistakes. We connect the tools a business already uses so information moves between them on its own, and people only step in where a decision is needed.', scope: ['Workflow review', 'Tool connections', 'Notifications and handoffs', 'Form and data automations', 'Error handling', 'Documentation'] },
    { id: 'website-design-development', name: 'Website Design & Development', body: 'A website is often the first place people act on their interest. We design and build sites that are clear, fast and easy to use, and connect them to the systems that handle what happens after someone gets in touch.', scope: ['Site structure', 'Interface design', 'Development', 'Content management', 'Forms and integrations', 'Performance and accessibility checks', 'Launch support'] },
    { id: 'technology-led-business-solutions', name: 'Technology-led Business Solutions', body: 'Some problems need a tool that does not exist off the shelf. We work through the problem, define what a practical solution should do, and design and build it at the scale the business needs.', scope: ['Problem definition', 'Solution design', 'Prototypes', 'Custom tools and portals', 'Integrations', 'Ongoing improvements where agreed'] },
  ],
  stepsTitle: 'From process to working system.',
  steps: [
    ['Understand the process', 'Learn how the work happens today, which tools are in use and where time or information is lost.'],
    ['Define the solution', 'Recommend what to build, connect or automate, and agree on scope, platforms, timing and review points.'],
    ['Build and test', 'Develop the system in stages, test it against real scenarios and review it together before launch.'],
    ['Launch and support', 'Put the system into use, hand over documentation and support the team as it settles in.'],
  ],
  engage: {
    title: 'A build that fits the business.',
    body: 'Come to Moreward for one defined build, a connected system that brings several together, or ongoing support as the business grows. We establish the scope after understanding the process. Every engagement has agreed deliverables, timing and review points.',
    options: [['One build', 'One defined website, CRM or automation.'], ['Connected system', 'Several tools built and connected together.'], ['Ongoing support', 'Improvements and support as the business grows.']],
    note: 'Most systems rely on third-party platforms such as hosting, CRM, AI and automation tools. Their subscriptions, usage costs and terms sit with the business. We recommend and set them up during the project.',
  },
  close: {
    eyebrow: 'Have something in mind?', title: 'Let’s give it direction.',
    body: 'Tell us how the work happens today, where it slows down and what you would like it to do. You do not need a technical brief to start the conversation.',
    button: 'Start a Technology & Automation project',
  },
}
