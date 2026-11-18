import { capabilities, projects } from '../baseline/data.js'
import { SITE_DESCRIPTION, SOCIAL, STUDIO_EMAIL } from './site.js'

export function schemaFor(pathname, origin) {
  const absolute = path => origin + path
  const graph = [
    { '@type': 'Organization', name: 'Moreward Studio', url: origin, email: STUDIO_EMAIL, description: SITE_DESCRIPTION, sameAs: SOCIAL.map(item => item.url) },
    { '@type': 'WebSite', name: 'Moreward Studio', url: origin, description: SITE_DESCRIPTION },
  ]
  const project = projects.find(item => pathname === '/work/' + item.slug)
  const capability = capabilities.find(item => pathname === '/capabilities/' + item.slug)
  if (project) graph.push({ '@type': 'CreativeWork', name: project.title, description: project.summary, genre: project.category, image: absolute('/images/' + project.image.id + '-' + project.image.width + '.webp'), creativeWorkStatus: 'Self-initiated study' })
  if (capability) graph.push({ '@type': 'Service', name: capability.name, description: capability.hubBody, provider: { '@type': 'Organization', name: 'Moreward Studio' } })
  if (project || capability) graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: project ? 'Work' : 'Capabilities', item: absolute(project ? '/work' : '/capabilities') },
    { '@type': 'ListItem', position: 2, name: project?.title || capability?.name, item: absolute(pathname) },
  ] })
  return { '@context': 'https://schema.org', '@graph': graph }
}
