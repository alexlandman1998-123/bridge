import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import DemoInsurancePreview from '../../src/components/client-portal/insurance/demoInsurancePreview'

createRoot(document.getElementById('root')).render(<StrictMode><DemoInsurancePreview /></StrictMode>)
