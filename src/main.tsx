import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RootApp } from './App.tsx'

const isSecureWebOrigin = window.location.protocol === 'https:' ||
  (window.location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(window.location.hostname))

if (import.meta.env.PROD && 'serviceWorker' in navigator && isSecureWebOrigin) {
  const registerServiceWorker = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.error('Scoreline service worker registration failed:', error)
    })
  }

  if (document.readyState === 'complete') {
    registerServiceWorker()
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
