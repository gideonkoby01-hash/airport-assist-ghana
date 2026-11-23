import '@/lib/authLinkRedirect'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@fontsource-variable/figtree'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/sora'
import '@fontsource-variable/playfair-display'
import '@fontsource-variable/playfair-display/wght-italic.css'
import '@/index.css'
import { registerServiceWorker } from '@/lib/pwa'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

registerServiceWorker()
