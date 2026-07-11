import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

const appSource = await read('../src/App.jsx')
const viteConfig = await read('../vite.config.js')
const packageJson = JSON.parse(await read('../package.json'))
const authSessionSource = await read('../src/context/AuthSessionContext.jsx')
const authBootSource = await read('../src/lib/authBoot.js')
const organisationContext = await read('../src/context/OrganisationContext.jsx')
const workspaceContext = await read('../src/context/WorkspaceContext.jsx')
const workspaceScopedCache = await read('../src/services/workspaceScopedCache.js')
const agentDataService = await read('../src/lib/agentDataService.js')
const attorneyMockData = await read('../src/core/transactions/attorneyMockData.js')
const mockData = await read('../src/lib/mockData.js')
const attorneyTransactionDetail = await read('../src/pages/AttorneyTransactionDetail.jsx')

assert.match(
  mockData,
  /MOCK_DATA_ENABLED\s*=\s*false/,
  'Mock data should remain disabled after removing seed payloads.',
)
assert.doesNotMatch(
  appSource,
  /agentDemoSeed/,
  'App should not import removed agent demo seed data.',
)

for (const [label, source] of [
  ['agent data service', agentDataService],
  ['attorney mock data', attorneyMockData],
]) {
  assert.doesNotMatch(
    source,
    /agentDemoSeed/,
    `${label} should not statically import the full seed module.`,
  )
}

assert.match(
  attorneyTransactionDetail,
  /import\('html2pdf\.js\/src\/index\.js'\)/,
  'Bond application PDF export should import html2pdf source entry so PDF dependencies can be split.',
)
assert.doesNotMatch(
  attorneyTransactionDetail,
  /import\('html2pdf\.js'\)/,
  'Bond application PDF export should avoid the bundled html2pdf dist entry.',
)

assert.match(
  viteConfig,
  /chunkSizeWarningLimit:\s*1600/,
  'Vite should keep an explicit app-shell chunk warning budget instead of relying on the default.',
)

assert.match(
  packageJson.scripts.build,
  /--max-old-space-size=4096/,
  'Production build should use the launch-ready heap size verified by the document generator QA pass.',
)

for (const chunkName of [
  'app-access-shell',
  'app-commercial-shell',
  'app-api',
  'app-settings-api',
  'app-attorney-workflow',
]) {
  assert.match(viteConfig, new RegExp(chunkName), `Vite config should split ${chunkName} out of the entry chunk.`)
}

assert.doesNotMatch(
  viteConfig,
  /normalizedId\.includes\('\/src\/lib\/'\)\)\s*return\s*'app-lib'/,
  'Vite config should not collect every src/lib module into one oversized app-lib chunk.',
)
for (const broadSourceRule of [
  '/src/auth/',
  '/src/context/',
  '/src/constants/',
  '/src/config/',
]) {
  assert.doesNotMatch(
    viteConfig,
    new RegExp(`normalizedId\\.includes\\('${broadSourceRule.replace(/\//g, '\\/')}'\\)`),
    `Vite config should not collect every ${broadSourceRule} module into the first-load access shell.`,
  )
}
assert.doesNotMatch(
  viteConfig,
  /normalizedId\.includes\('\/src\/services\/observability\/'\)/,
  'Vite config should not merge observability modules into the first-load access shell.',
)
assert.doesNotMatch(
  viteConfig,
  /onlyExplicitManualChunks:\s*true/,
  'Vite config should avoid onlyExplicitManualChunks because it introduces noisy circular source chunks in this app.',
)
assert.doesNotMatch(
  viteConfig,
  /['"]\/src\/lib\/authBoot\.js['"]/,
  'Auth boot should not be assigned to the first-load access shell because it loads workspace and onboarding services.',
)

assert.doesNotMatch(
  authBootSource,
  /import\s*\{\s*getOrCreateUserProfile\s*\}\s*from\s*['"]\.\/api['"]/,
  'Auth boot should lazy-load the large api module instead of adding it to the app shell.',
)
assert.doesNotMatch(
  authSessionSource,
  /from\s*['"]\.\.\/services\/observability\//,
  'Auth session should lazy-load observability helpers instead of adding audit and validation modules to the app shell.',
)
assert.doesNotMatch(
  authSessionSource,
  /from\s*['"]\.\.\/lib\/authBoot['"]/,
  'Auth session should lazy-load auth boot instead of adding onboarding and workspace resolution to the app shell.',
)
assert.doesNotMatch(
  authSessionSource,
  /import\s*\{\s*setActiveWorkspacePreference\s*\}\s*from\s*['"]\.\.\/services\/workspaceResolutionService['"]/,
  'Auth session should lazy-load workspace preference persistence instead of adding workspace resolution to the app shell.',
)
assert.doesNotMatch(
  workspaceContext,
  /import\s*\{\s*updateUserProfile\s*\}\s*from\s*['"]\.\.\/lib\/api['"]/,
  'Workspace context should lazy-load profile saving from the large api module.',
)
assert.doesNotMatch(
  workspaceContext,
  /import\s*\{\s*completeOnboarding\s*\}\s*from\s*['"]\.\.\/services\/onboarding\/onboardingEngine['"]/,
  'Workspace context should lazy-load onboarding completion instead of adding onboarding persistence to the app shell.',
)
assert.doesNotMatch(
  organisationContext,
  /import\s*\{\s*fetchAgencyOnboardingSettings\s*\}\s*from\s*['"]\.\.\/lib\/settingsApi['"]/,
  'Organisation context should lazy-load settings hydration instead of adding settingsApi to the app shell.',
)
assert.doesNotMatch(
  workspaceScopedCache,
  /from\s*['"]\.\.\/lib\/settingsApi['"]/,
  'Workspace cache clearing should lazy-load settingsApi instead of adding settings hydration to the app shell.',
)

for (const chunkName of [
  'html2pdf-runtime',
  'vendor-html2canvas',
  'vendor-jspdf',
  'vendor-dompurify',
  'vendor-fflate',
  'vendor-canvg',
]) {
  assert.match(viteConfig, new RegExp(chunkName), `Vite config should keep ${chunkName} manual chunking in place.`)
}

console.log('build chunk hygiene tests passed')
