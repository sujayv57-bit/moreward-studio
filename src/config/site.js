export const STUDIO_EMAIL = 'hq@morewardstudio.com'

// Studio social profiles (footer tiles, contact page, menu, Organization schema).
export const SOCIAL = [
  { name: 'Instagram', handle: '@moreward.studio', url: 'https://www.instagram.com/moreward.studio/' },
  { name: 'LinkedIn', handle: 'Moreward', url: 'https://www.linkedin.com/company/moreward/' },
  { name: 'Facebook', handle: 'Moreward Studio', url: 'https://www.facebook.com/profile.php?id=61596389983228' },
]

export const SITE_DESCRIPTION = 'Moreward is an independent creative and technology studio working across brand, advertising, media and digital systems.'

export const PUBLIC_PATHS = [
  '/', '/work',
  '/capabilities', '/capabilities/creative-marketing', '/capabilities/advertising-media',
  '/capabilities/technology-automation', '/contact', '/privacy', '/terms',
]

// Standalone pages served from /public (not rendered by the app). Listed in the sitemap only.
export const STATIC_PATHS = ['/work/betach', '/work/kriya-setu', '/work/rucaa']

export const seo = {
  '/': { title: 'Moreward | Direction, made visible.', description: 'Independent creative and technology studio. Brand, campaigns, outdoor and broadcast media, and the websites, CRMs and automations behind them.', image: '/social-card.png' },
  '/work': { title: 'Work | Moreward', description: 'Brand identities for BETACH Consulting Services, Kriya Setu and Rucaa, by Moreward.', image: '/images/betach-plate-1254.webp' },
  '/capabilities': { title: 'Capabilities | Moreward', description: 'Creative & Marketing, Advertising & Media, and Technology & Automation under one roof, working from the same brief. How the studio works, from first conversation to launch.' },
  '/capabilities/creative-marketing': { title: 'Creative & Marketing | Moreward', description: 'Marketing strategy, brand identity, advertising design, campaign development, influencer marketing and content creation. What each can involve and how a project is scoped.' },
  '/capabilities/advertising-media': { title: 'Advertising & Media | Moreward', description: 'Outdoor, billboard and banner, metro, television, radio and print advertising, with media planning that gives every placement a clear purpose.' },
  '/capabilities/technology-automation': { title: 'Technology & Automation | Moreward', description: 'Websites, custom CRMs, workflow and AI automation that turn attention into enquiries and business.' },
  '/contact': { title: 'Contact | Moreward', description: 'Start a project with Moreward. Tell us about a launch, a campaign or a system that needs work.' },
  '/privacy': { title: 'Privacy Policy | Moreward', description: 'How the Moreward website handles your information.' },
  '/terms': { title: 'Terms | Moreward', description: 'Terms of use for the Moreward website.' },
  '404': { title: 'Page not found | Moreward', description: SITE_DESCRIPTION, noindex: true },
}
