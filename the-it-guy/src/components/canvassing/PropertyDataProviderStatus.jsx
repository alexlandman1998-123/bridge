import { FlaskConical, Server, ShieldCheck } from 'lucide-react'
import { propertyDataProvider } from '../../services/propertyIntelligence/propertyDataProvider'

export default function PropertyDataProviderStatus() {
  const isDemo = propertyDataProvider.mode === 'mock' || propertyDataProvider.isDemoData
  const Icon = isDemo ? FlaskConical : Server
  return (
    <aside
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${isDemo ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
      data-property-provider-mode={propertyDataProvider.mode}
      aria-label="Property data provider status"
    >
      <span className="inline-flex items-center gap-2 font-semibold"><Icon size={17} />{isDemo ? 'Demonstration property intelligence' : 'Connected property intelligence'}</span>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium"><ShieldCheck size={15} />{isDemo ? 'Fictional records • No live provider charges' : 'Requests secured through the Arch9 server integration'}</span>
    </aside>
  )
}
