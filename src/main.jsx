import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { RouterClient } from '@tanstack/react-router/ssr/client'
import { createAppRouter } from './App.jsx'
import './baseline.css'
import './hero.css'
import './overhaul.css'
import './why.css'
import './orbits.css'
import './process.css'
import './footer.css'
import './work.css'
import './disciplines.css'
import './premium.css'

const root = document.getElementById('root')
const router = createAppRouter()
if (root.hasChildNodes()) hydrateRoot(root, <RouterClient router={router} />)
else createRoot(root).render(<RouterClient router={router} />)
