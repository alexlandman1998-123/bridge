export const HOME_SEEKERS_PUBLIC_HOSTS = ['homeseeker.co.za', 'www.homeseeker.co.za']

export function homeSeekersPreviewUrl(value) {
  try {
    const url = new URL(value)
    if (!HOME_SEEKERS_PUBLIC_HOSTS.includes(url.hostname)) return value
    url.searchParams.set('arch9_preview', '1')
    return url.href
  } catch { return value }
}

export function isHomeSeekersPublicTraffic({ hostname = '', pathname = '', embedded = false, automated = false, search = '' } = {}) {
  return HOME_SEEKERS_PUBLIC_HOSTS.includes(hostname.toLowerCase()) && !embedded && !automated &&
    !pathname.startsWith('/demo/') && !new URLSearchParams(search).has('arch9_preview')
}

export function homeSeekersBrowserIsPublic(browser, navigator) {
  const { location } = browser
  let internalSession = false
  try {
    if (new URLSearchParams(location.search).has('arch9_preview')) browser.sessionStorage.setItem('home-seekers-internal-preview', '1')
    internalSession = browser.sessionStorage.getItem('home-seekers-internal-preview') === '1'
  } catch { /* Host and frame checks still apply without browser storage. */ }
  return !internalSession && isHomeSeekersPublicTraffic({ hostname: location.hostname, pathname: location.pathname,
    search: location.search, embedded: browser.self !== browser.top, automated: navigator.webdriver === true })
}

// Privacy-conscious visits expire after 30 minutes of inactivity in this tab.
export function homeSeekersVisitIsNew(storage, now = Date.now()) {
  const previous = Number(storage.getItem('home-seekers-public-last-activity') || 0)
  storage.setItem('home-seekers-public-last-activity', String(now))
  return !previous || now - previous >= 30 * 60 * 1000
}
