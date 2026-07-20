import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

const fluidPageFiles = [
  '../src/pages/settings/LegalDocumentsLandingPage.jsx',
  '../src/pages/settings/LegalDocumentOverviewPage.jsx',
  '../src/pages/settings/LegalDocumentPreviewPage.jsx',
  '../src/pages/settings/LegalDocumentEditorRoute.jsx',
  '../src/pages/settings/SettingsLayout.jsx',
  '../src/pages/PipelineOverviewPage.jsx',
  '../src/pages/PartnersPage.jsx',
]

for (const path of fluidPageFiles) {
  const source = await read(path)
  assert.match(source, /w-full max-w-none/, `${path} should defer horizontal sizing to the shared app shell`)
}

for (const path of fluidPageFiles.slice(0, 4)) {
  const source = await read(path)
  assert.doesNotMatch(
    source,
    /mx-auto w-full max-w-\[(?:1280|1380|1400)px\]/,
    `${path} should not add a centered fixed-width gutter inside the legal documents workspace`,
  )
}

const premiumShell = await read('../src/styles/premiumSaaS.css')
assert.match(
  premiumShell,
  /\.ui-content-container,[\s\S]*padding-inline:\s*clamp\(1\.25rem,\s*2\.2vw,\s*2\.5rem\)/,
  'the shared app shell should own the adaptive menu-to-content and content-to-scrollbar gutters',
)

const partnersPage = await read('../src/pages/PartnersPage.jsx')
assert.doesNotMatch(
  partnersPage,
  /min-h-full[^\n]*px-4[^\n]*sm:px-6[^\n]*lg:px-8/,
  'partner profile states should not add a second horizontal gutter inside the shared app shell',
)

console.log('Workspace responsive layout contract passed.')
