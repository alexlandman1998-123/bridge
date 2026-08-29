let activityWorkspacePromise = null
let sellerAppointmentsWorkspacePromise = null

function loadCached(currentPromise, setPromise, importer) {
  if (currentPromise) return currentPromise
  const pending = importer().catch((error) => {
    setPromise(null)
    throw error
  })
  setPromise(pending)
  return pending
}

export function loadLeadActivityWorkspace() {
  return loadCached(
    activityWorkspacePromise,
    (value) => { activityWorkspacePromise = value },
    () => import('../../components/lead-activity/LeadActivityWorkspace'),
  )
}

export function loadSellerAppointmentsWorkspace() {
  return loadCached(
    sellerAppointmentsWorkspacePromise,
    (value) => { sellerAppointmentsWorkspacePromise = value },
    () => import('../../components/appointments/KingstonsSellerAppointmentsWorkspace'),
  )
}

export function preloadAgencyLeadWorkspaceTab(tabKey = '', { seller = false } = {}) {
  if (tabKey === 'activity') return loadLeadActivityWorkspace().catch(() => null)
  if (tabKey === 'appointments' && seller) return loadSellerAppointmentsWorkspace().catch(() => null)
  return Promise.resolve(null)
}
