function arch9AppPath(path) {
  try {
    const base = new URL(import.meta.env?.VITE_ARCH9_APP_URL || 'https://app.arch9.co.za')
    if (base.protocol === 'https:') return new URL(path, base.origin).href
  } catch { /* Use the established Arch9 address if configuration is invalid. */ }
  return `https://app.arch9.co.za${path}`
}

export function recruitmentApplicantPortalUrl() { return arch9AppPath('/applicant/my-profile') }
export function homeSeekersLoginUrl() { return arch9AppPath('/homeseekers/login') }
