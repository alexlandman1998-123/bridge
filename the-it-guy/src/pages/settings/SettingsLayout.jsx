import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { SettingsLoadingState } from './settingsUi'

export default function SettingsLayout() {
  return (
    <section className="settings-shell min-h-[calc(100vh-96px)] pb-12 pt-0">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <main className="settings-content min-w-0">
          <Suspense fallback={<SettingsLoadingState label="Loading settings section..." compact />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </section>
  )
}
