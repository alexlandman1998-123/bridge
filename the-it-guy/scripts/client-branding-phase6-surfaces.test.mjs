import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const portalService = await readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const clientPortal = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const statusShare = await readFile(new URL('../src/pages/TransactionStatusShare.jsx', import.meta.url), 'utf8')
const appCss = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const bridgeEmailLayout = await readFile(new URL('../../supabase/functions/send-email/content/bridgeEmailLayout.ts', import.meta.url), 'utf8')
const sellerOnboardingHandler = await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboarding.ts', import.meta.url), 'utf8')
const sellerOnboardingSubmittedHandler = await readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboardingSubmitted.ts', import.meta.url), 'utf8')
const emailTypes = await readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

for (const token of [
  'async function resolveClientSurfaceBranding',
  'fetchBuyerOrganisationBrandingContext(client, normalizedOrganisationId)',
  'normalizeBuyerOnboardingBranding({',
  'clientTheme: branding.clientTheme',
  'const clientSurfaceBranding = await resolveClientSurfaceBranding(client,',
  '...clientSurfaceBranding',
  'id, organisation_id, development_id, unit_id',
]) {
  assert(api.includes(token), `client-facing API surfaces should include branding marker: ${token}`)
}

for (const token of [
  "import { resolveClientBrandTheme } from '../lib/clientBrandTheme'",
  'const clientTheme = resolveClientBrandTheme({',
  'branding,',
  'clientTheme,',
  'clientTheme: portalData?.clientTheme || portalData?.branding?.clientTheme || null',
]) {
  assert(portalService.includes(token), `client portal workspace should expose branding marker: ${token}`)
}

for (const token of [
  'buildClientBrandCssVars',
  'resolveClientBrandTheme',
  'const clientBrandTheme = useMemo(() => resolveClientBrandTheme({',
  'const clientPortalBrandStyle = useMemo(() => ({',
  '--client-portal-sidebar-bg',
  '--client-portal-hero-bg',
  'style={clientPortalBrandStyle}',
  'src={clientBrandLogoUrl}',
]) {
  assert(clientPortal.includes(token), `client portal UI should apply branding marker: ${token}`)
}

for (const token of [
  'buildClientBrandCssVars',
  'resolveClientBrandTheme',
  'const clientBrandTheme = useMemo(() => resolveClientBrandTheme({',
  '--status-share-page-bg',
  'className="status-share-logo"',
  'authorName: `${clientBrandName} Workspace`',
]) {
  assert(statusShare.includes(token), `status share should apply branding marker: ${token}`)
}

for (const token of [
  'background: var(--status-share-page-bg',
  '.status-share-logo',
  'var(--client-brand-primary',
]) {
  assert(appCss.includes(token), `status share CSS should use client brand vars marker: ${token}`)
}

for (const token of [
  'brandPrimaryColor = ""',
  'brandAccentColor = ""',
  'normalizeBrandColor(brandPrimaryColor',
  'border-top: 4px solid ${safeBrandAccentColor}',
]) {
  assert(bridgeEmailLayout.includes(token), `shared email layout should accept brand colours marker: ${token}`)
}

for (const source of [sellerOnboardingHandler, sellerOnboardingSubmittedHandler]) {
  for (const token of [
    'primary_color, accent_color, primary_brand_color, accent_brand_color, theme_json',
    'brandPrimaryColor = normalizeText(brandingQuery.data?.primary_color)',
    'brandAccentColor = normalizeText(brandingQuery.data?.accent_color)',
    'brandPrimaryColor = resolvedOrganisation.brandPrimaryColor || brandPrimaryColor',
    'brandAccentColor = resolvedOrganisation.brandAccentColor || brandAccentColor',
  ]) {
    assert(source.includes(token), `seller email handler should resolve canonical brand colours marker: ${token}`)
  }
}

for (const token of [
  'brandPrimaryColor?: string;',
  'brand_primary_color?: string;',
  'brandAccentColor?: string;',
  'brand_accent_color?: string;',
]) {
  assert(emailTypes.includes(token), `email payload types should include optional brand colour marker: ${token}`)
}

assert.equal(
  packageJson.scripts?.['test:client-branding-phase6-surfaces'],
  'node scripts/client-branding-phase6-surfaces.test.mjs',
  'package scripts should expose the Phase 6 client branding surfaces test',
)

console.log('Client branding Phase 6 surfaces contract passed.')
