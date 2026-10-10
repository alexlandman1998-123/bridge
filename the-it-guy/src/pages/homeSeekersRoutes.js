const demoPath = '/demo/homeseekers'

// The same pages also run inside Arch9's demo. Only the standalone build uses
// public paths at the domain root; the CRM keeps its existing demo navigation.
export function homeSeekersPath(path = '/') {
  const suffix = path === '/' ? '' : path
  return import.meta.env?.VITE_HOME_SEEKERS_STANDALONE === 'true'
    ? suffix || '/'
    : `${demoPath}${suffix}`
}
