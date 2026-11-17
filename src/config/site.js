export const STUDIO_EMAIL = 'sujay@nidhivriddhi.com'

export const SITE_DESCRIPTION = 'Moreward is an independent creative and technology studio working across brand, advertising, media and digital systems.'

export const PUBLIC_PATHS = [
  '/', '/work',
  '/capabilities', '/capabilities/creative-marketing', '/capabilities/advertising-media',
  '/capabilities/technology-automation', '/studio', '/contact', '/privacy', '/terms',
]

// Standalone pages served from /public (not rendered by the app). Listed in the sitemap only.
export const STATIC_PATHS = ['/work/betach', '/work/kriya-setu', '/work/rucaa']

export const seo = {
  '/': { title: 'Moreward | Direction, made visible.', description: 'Independent creative and technology studio. Brand, campaigns, outdoor and broadcast media, and the websites, CRMs and automations behind them.', image: '/social-card.png' },
  '/work': { title: 'Work | Moreward', description: 'Brand identities for BETACH Consulting Services, Kriya Setu and Rucaa, by Moreward.', image: '/images/betach-plate-1254.webp' },
  '/capabilities': { title: 'Capabilities | Moreward', description: 'Creative & Marketing, Advertising & Media, and Technology & Automation, under one roof and working from the same brief.' },
  '/capabilities/creative-marketing': { title: 'Creative & Marketing | Moreward', description: 'Positioning, brand identity, advertising design, campaigns, creator marketing and content from Moreward.' },
  '/capabilities/advertising-media': { title: 'Advertising & Media | Moreward', description: 'Outdoor, billboard, metro, television, radio and print advertising, with media planning, from Moreward.' },
  '/capabilities/technology-automation': { title: 'Technology & Automation | Moreward', description: 'Websites, custom CRMs, workflow and AI automation that turn attention into enquiries and business.' },
  '/studio': { title: 'Studio | Moreward', description: 'Moreward is an independent studio for creative, advertising and technology work. Our principles and how we work.', image: '/social-card.png' },
  '/contact': { title: 'Contact | Moreward', description: 'Start a project with Moreward. Tell us about a launch, a campaign or a system that needs work.' },
  '/privacy': { title: 'Privacy Policy | Moreward', description: 'How the Moreward website handles your information.' },
  '/terms': { title: 'Terms | Moreward', description: 'Terms of use for the Moreward website.' },
  '404': { title: 'Page not found | Moreward', description: SITE_DESCRIPTION, noindex: true },
}
