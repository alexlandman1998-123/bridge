import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const ROOT_INSTANCE_KEY = '__arch9ReactRoot'
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Arch9 could not start because the root element is missing.')
}

const root = rootElement[ROOT_INSTANCE_KEY] || createRoot(rootElement)
rootElement[ROOT_INSTANCE_KEY] = root

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
