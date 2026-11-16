const image = (id, width, height) => ({ src: `/images/${id}-${width}.webp`, id, width, height })

export const imagery = {
  identity: image('identity-cards', 1300, 731),
  campaign: image('campaign-shelter', 1040, 1300),
  device: image('digital-device', 1040, 1300),
  environment: image('studio-environment', 1300, 731),
  application: image('brand-application', 1200, 800),
  web: image('digital-experience', 1300, 731),
}

export const navigation = [
  { label: 'Work', to: '/work' },
  { label: 'Capabilities', to: '/capabilities' },
  { label: 'Studio', to: '/studio' },
  { label: 'Contact', to: '/contact' },
]

export const projects = [
  {
    number: '01', slug: 'betach', title: 'BETACH', client: true, href: '/work/betach',
    summary: 'Protection, built on trust.',
    image: image('betach-cards', 1300, 867), imageAlt: 'BETACH business cards, navy and white, stacked',
  },
  {
    number: '02', slug: 'kriya-setu', title: 'Kriya Setu', client: true, href: '/work/kriya-setu',
    summary: 'Brand identity for an experiential learning platform. Bridging knowledge and real competence.',
    image: image('kriya-setu-mark', 1300, 743), imageAlt: 'The Kriya Setu mark: a student raising a hand beneath a spark, on blue',
  },
  {
    number: '03', slug: 'connected-signals', title: 'Connected signals', category: 'INTERFACE DESIGN',
    summary: 'An interface study for seeing every customer signal in one place.',
    heroBody: 'An interface study for seeing every customer signal in one place: the enquiry, the follow-up and the outcome.',
    briefTitle: "Most businesses already have the data. They just can't see it together.",
    briefBody: 'Enquiries arrive through forms, calls and messages, then scatter across inboxes and spreadsheets. The question was what a single, calm view of all of it could look like.',
    approachTitle: 'Hierarchy first, decoration last.',
    approachBody: 'The interface treats information as a path toward a decision: what came in, what happened next and what needs attention now.',
    covers: ['Interface study', 'Signal visualisation', 'Experience direction'],
    image: imagery.device, imageAlt: 'Device screen showing a connected path of customer signals',
    secondary: imagery.web, secondaryAlt: 'Device screen showing a connected path of customer signals',
  },
]

export const capabilities = [
  {
    number: '01', slug: 'creative-marketing', name: 'Creative & Marketing', title: 'Make the idea matter.',
    homeDescription: 'Strategy, identity, campaigns and content that give a brand something clear to say.',
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
    visual: imagery.identity, visualAlt: 'Moreward identity explored across printed cards',
    secondary: imagery.application, secondaryAlt: 'Moreward identity on apparel and tote',
    relatedSlug: 'betach',
  },
  {
    number: '02', slug: 'advertising-media', name: 'Advertising & Media', title: 'Take the message further.',
    homeDescription: 'Outdoor, metro, television, radio and print, planned so the work is seen where it counts.',
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
    visual: imagery.campaign, visualAlt: 'Moreward outdoor advertising study composition',
    secondary: imagery.environment, secondaryAlt: "Outdoor campaign panel with Moreward's run-and-rise line graphic",
    relatedSlug: null,
  },
  {
    number: '03', slug: 'technology-automation', name: 'Technology & Automation', title: 'Build what the business runs on.',
    homeDescription: 'Websites, custom CRMs and AI automations that turn interest into enquiries, and enquiries into customers.',
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
    visual: imagery.device, visualAlt: 'Interface study showing a connected signal path',
    secondary: imagery.web, secondaryAlt: 'Device screen showing a connected path of customer signals',
    relatedSlug: 'connected-signals',
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
