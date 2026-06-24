import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const pageSource = await fs.readFile(new URL('../src/pages/Arch9LaunchConcierge.jsx', import.meta.url), 'utf8')
const serviceSource = await fs.readFile(new URL('../src/services/launchEventLeadService.js', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606230001_arch9_launch_event_leads.sql', import.meta.url), 'utf8')

assert.match(appSource, /Arch9LaunchConcierge/, 'App should lazy-load the Arch9 launch concierge page')
for (const route of ['/arch9-launch', '/launch/arch9', '/qr/arch9']) {
  assert.match(appSource, new RegExp(`path="${route.replaceAll('/', '\\/')}"`), `${route} should be wired for QR-friendly sharing`)
}

for (const copy of [
  'Scan now. Meet privately this week.',
  'Request my private Arch9 session',
  'Request a private follow-up.',
  'No account setup',
  'Curated around your business',
]) {
  assert.match(pageSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Launch page should include: ${copy}`)
}

for (const marker of [
  "event_slug: 'arch9-launch-2026-06-24'",
  "source: 'event_qr'",
  "preferred_window: preferredWindow || null",
  "preferredFollowUp: normalizeText(form.preferredFollowUp) || 'private_follow_up_this_week'",
  "function shouldUseLocalLaunchCapture()",
  "remote submit failed; saved locally instead",
]) {
  assert.match(serviceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Lead service should include ${marker}`)
}

for (const marker of [
  'create table if not exists public.launch_event_leads',
  'to anon, authenticated',
  "event_slug = 'arch9-launch-2026-06-24'",
  'preferred_window text',
  'grant insert on public.launch_event_leads to anon',
]) {
  assert.match(migrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Migration should include ${marker}`)
}

console.log('arch9 launch concierge diagnostics passed')
