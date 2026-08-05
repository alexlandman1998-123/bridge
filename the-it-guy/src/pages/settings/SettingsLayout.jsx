import { Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { SettingsLoadingState } from './settingsUi'

function SettingsBackLink() {
  const location = useLocation()
  if (location.pathname === '/settings') return null

  return (
    <Link
      to="/settings"
      className="inline-flex w-max items-center gap-2 rounded-[10px] px-1 py-1 text-sm font-semibold text-[#43566d] transition hover:text-[#0f7f4f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dd9bd]"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      Back to settings
    </Link>
  )
}

export default function SettingsLayout() {
  return (
    <section className="settings-shell min-h-[calc(100vh-96px)] pb-12 pt-0">
      <div className="settings-workspace mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <main className="settings-content min-w-0 space-y-4">
          <SettingsBackLink />
          <Suspense fallback={<SettingsLoadingState label="Loading settings section..." compact />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </section>
  )
}
