import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const prefetchSource = await readFile(new URL('../src/lib/routePrefetch.js', import.meta.url), 'utf8')
const sidebarSource = await readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const viteSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/pages/Pipeline.jsx', import.meta.url), 'utf8')
const agencyPipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

test('primary routes prefetch during browser idle time with a bounded queue', () => {
  assert.match(sidebarSource, /scheduleIdleRoutePrefetch\(targets, \{ role \}, \{ maxRoutes: 4 \}\)/)
  assert.match(prefetchSource, /requestIdleCallback/)
  assert.match(prefetchSource, /delayMs = 1500, maxRoutes = 4/)
  assert.match(prefetchSource, /prefetchedRoutes = new Map\(\)/)
})

test('menu intent prefetches route modules on pointer and keyboard focus', () => {
  assert.match(sidebarSource, /onPointerEnter=\{\(\) => prefetchNavigationItem\(item\.to\)\}/)
  assert.match(sidebarSource, /onFocus=\{\(\) => prefetchNavigationItem\(item\.to\)\}/)
})

test('locked reports and heavy export libraries remain outside normal navigation loading', () => {
  assert.match(prefetchSource, /BLOCKED_PREFETCH_ROUTES = new Set\(\['\/reports', '\/mobile\/reports'\]\)/)
  assert.doesNotMatch(prefetchSource, /pages\/Report/)
  assert.match(viteSource, /normalizedId\.includes\('\/xlsx\/'\).*vendor-xlsx/)
  assert.match(viteSource, /minify: 'terser'/)
  assert.match(viteSource, /compress: \{ passes: [2-9] \}/)
})

test('pipeline actions load through a narrow facade instead of making the full API an entry chunk', () => {
  assert.match(pipelineSource, /import\('\.\.\/lib\/api\/pipelineApiActions'\)/)
  assert.match(agencyPipelineSource, /import\('\.\.\/\.\.\/lib\/api\/pipelineApiActions'\)/)
  assert.doesNotMatch(pipelineSource, /import\('\.\.\/lib\/api'\)/)
  assert.doesNotMatch(agencyPipelineSource, /import\('\.\.\/\.\.\/lib\/api'\)/)
})
