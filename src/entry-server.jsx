import React from 'react'
import { createRequestHandler, renderRouterToString, RouterServer } from '@tanstack/react-router/ssr/server'
import { createAppRouter } from './App.jsx'

export async function render(path) {
  const request = new Request('https://moreward.studio' + path)
  const handler = createRequestHandler({ request, createRouter: () => createAppRouter() })
  const response = await handler(({ request, responseHeaders, router }) => renderRouterToString({ request, responseHeaders, router, children: <RouterServer router={router}/> }))
  return response.text()
}
