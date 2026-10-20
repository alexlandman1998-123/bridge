import { lazy, Suspense, useState } from 'react'
import { MobileLeadCreateContext } from './mobileLeadCreateContext.js'
const MobileLeadCreateFlow = lazy(() => import('./MobileLeadCreateFlow.jsx'))
export default function MobileLeadCreateProvider({ children }) {
  const [open, setOpen] = useState(false)
  return <MobileLeadCreateContext.Provider value={{ openLeadCreate: () => setOpen(true) }}>
    {children}
    {open && <Suspense fallback={null}><MobileLeadCreateFlow onClose={() => setOpen(false)} /></Suspense>}
  </MobileLeadCreateContext.Provider>
}
