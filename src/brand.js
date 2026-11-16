import identityImage from './assets/identity-cards.jpg'
import campaignImage from './assets/campaign-shelter.jpg'
import deviceImage from './assets/digital-device.jpg'
import environmentImage from './assets/studio-environment.jpg'

export const capabilities = [
  { slug: 'strategy', name: 'Marketing & Strategy', line: 'The right question, the right position, the right direction.', services: ['Market and customer research', 'Positioning', 'Go-to-market strategy', 'Growth planning', 'Campaign strategy'], mark: 'S' },
  { slug: 'brand-creative', name: 'Advertising & Campaigns', line: 'Ideas that earn attention and move people toward action.', services: ['Creative direction', 'Campaign concepts', 'Brand systems', 'Content and film', 'Performance creative'], mark: 'C' },
  { slug: 'growth-acquisition', name: 'Influencer Marketing', line: 'Credible voices and useful partnerships with a clear purpose.', services: ['Creator strategy', 'Partner selection', 'Campaign development', 'Content direction', 'Performance learning'], mark: 'I' },
  { slug: 'media-experiences', name: 'Outdoor Advertising', line: 'Ideas built to make an impression beyond the screen.', services: ['Billboards and transit', 'Metro and outdoor', 'Television and radio', 'Print', 'Spatial campaigns'], mark: 'O' },
  { slug: 'ai-business-systems', name: 'AI Automations', line: 'Intelligence and workflows that make good work go further.', services: ['AI-assisted qualification', 'Workflow automation', 'Customer intelligence', 'Campaign intelligence', 'Reporting support'], mark: 'A' },
  { slug: 'digital-experience', name: 'Custom CRM & Digital Solutions', line: 'Connected digital places and systems built around the business.', services: ['Custom CRM', 'Websites and landing pages', 'Lead systems', 'Digital experience', 'Sales workflows'], mark: 'D' },
]

export const method = [
  ['Discover', 'Listen closely. Understand the business, audience and opportunity.'],
  ['Define', 'Find the position and the measure of a meaningful next step.'],
  ['Create', 'Shape the idea, the experience and the system around it.'],
  ['Deliver', 'Bring the work into the market with care and precision.'],
  ['Evolve', 'Learn from response and improve what moves the business.'],
]

export const projects = [
  { slug: 'a-sharper-reason', category: 'Brand Identity', title: 'The Moreward identity', descriptor: 'An exploration of a studio identity built to move.', image: identityImage, imageAlt: 'Moreward Studio business card identity study', number: '01', story: 'A study in clarity, directional energy and a visual system that can travel across every touchpoint.' },
  { slug: 'attention-to-action', category: 'Campaigns', title: 'Movement in public', descriptor: 'An illustrative outdoor campaign direction.', image: campaignImage, imageAlt: 'Illustrative Moreward campaign on an outdoor transit panel', number: '02', story: 'A visual exploration of how a simple directional idea can become a public message with immediate presence.' },
  { slug: 'connected-view', category: 'Digital Systems', title: 'Signal to decision', descriptor: 'An illustrative customer intelligence experience.', image: deviceImage, imageAlt: 'Concept digital device showing a connected signal path', number: '03', story: 'A concept for bringing marketing signals, customer understanding and better decisions into one view.' },
  { slug: 'brand-in-space', category: 'Brand Identity', title: 'A brand in space', descriptor: 'An exploration of the Moreward identity in an environment.', image: environmentImage, imageAlt: 'Moreward Studio identity applied to an interior wall', number: '04', story: 'A study of how a clear identity can become an experience people encounter in the physical world.' },
]

export const industries = ['Financial Services', 'Technology', 'Healthcare', 'Consumer Brands', 'Professional Services', 'Education', 'Hospitality', 'Lifestyle', 'Retail', 'B2B', 'Emerging Businesses', 'Real Estate']
