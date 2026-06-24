import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const indexSource = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8')
const pageSource = await fs.readFile(new URL('../src/pages/Arch9LaunchConcierge.jsx', import.meta.url), 'utf8')
const serviceSource = await fs.readFile(new URL('../src/services/launchEventLeadService.js', import.meta.url), 'utf8')
const sendEmailIndexSource = await fs.readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const sendEmailTypesSource = await fs.readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const arch9EmailSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/arch9LaunchConfirmation.ts', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606230001_arch9_launch_event_leads.sql', import.meta.url), 'utf8')

assert.match(appSource, /Arch9LaunchConcierge/, 'App should lazy-load the Arch9 launch concierge page')
for (const route of ['/arch9-launch', '/launch/arch9', '/qr/arch9']) {
  assert.match(appSource, new RegExp(`path="${route.replaceAll('/', '\\/')}"`), `${route} should be wired for QR-friendly sharing`)
}

for (const copy of [
  'Let’s take your agency to the next level.',
  'Request a private strategy session after today’s launch.',
  'Start Request',
  'Let’s start with your details.',
  'What best describes you?',
  'What would you like to improve most?',
  'Select up to 2.',
  'Faster registrations',
  'Less admin',
  'Better client communication',
  'Better visibility across transactions',
  'More time selling, less time chasing',
  'Better team accountability',
  'Commercial property workflows',
  'Developer sales management',
  'Show me everything',
  'When works best for you?',
  'Request Follow-Up',
  'All set. We’ll be in touch.',
  'Know someone who might also benefit?',
  'principals, agents, attorneys, bond originators and developers',
  'Share via WhatsApp',
  'Copy Link',
  'Invitation link copied',
  'success_referral_whatsapp_clicked',
  'success_referral_copy_link_clicked',
  'launch_concierge_success',
  'https://wa.me/?text=',
  'Built around your agency',
  'Faster transactions, fewer follow-ups',
  'Complete visibility from offer to registration',
]) {
  assert.match(pageSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Launch page should include: ${copy}`)
}

for (const removedCopy of [
  'DOMAIN_LABEL',
  'app.arch9.co.za</',
]) {
  assert.doesNotMatch(pageSource, new RegExp(removedCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Launch page should not include redundant footer copy: ${removedCopy}`)
}

for (const marker of [
  '<title>Arch9 Concierge</title>',
  'Request a private Arch9 strategy session after the launch.',
  'https://app.arch9.co.za/arch9-launch-preview.png',
  'https://app.arch9.co.za/qr/arch9',
  'summary_large_image',
]) {
  assert.match(indexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Index metadata should include ${marker}`)
}

for (const marker of [
  "event_slug: 'arch9-launch-2026-06-24'",
  "event_name: 'Arch9 Launch'",
  "event_date: '2026-06-24'",
  "source: 'arch9_launch_qr'",
  "role_type: roleType",
  "discussion_focus: discussionFocus || null",
  "discussionFocusSelections",
  "preferred_time: preferredTime || null",
  "function shouldUseLocalLaunchCapture()",
  "remote submit failed; saved locally instead",
  "invokeEdgeFunction('send-email'",
  "type: 'arch9_launch_confirmation'",
  "confirmation email failed",
]) {
  assert.match(serviceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Lead service should include ${marker}`)
}

for (const marker of [
  'handleArch9LaunchConfirmationEmail',
  'arch9_launch_confirmation',
]) {
  assert.match(sendEmailIndexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `send-email index should include ${marker}`)
}

for (const marker of [
  'SendArch9LaunchConfirmationPayload',
  'arch9_concierge_confirmation',
]) {
  assert.match(sendEmailTypesSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `send-email types should include ${marker}`)
}

for (const marker of [
  'Thank you. We’ll be in contact shortly.',
  'We’ve received your request for a private Arch9 strategy session.',
  'RESEND_API_KEY',
  'Arch9 Concierge',
]) {
  assert.match(arch9EmailSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Arch9 confirmation email should include ${marker}`)
}

for (const marker of [
  'create table if not exists public.launch_event_leads',
  'to anon, authenticated',
  "event_slug = 'arch9-launch-2026-06-24'",
  'event_name text',
  'event_date date',
  'role_type text',
  'discussion_focus text',
  'preferred_time text',
  'preferred_window text',
  'grant insert on public.launch_event_leads to anon',
]) {
  assert.match(migrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Migration should include ${marker}`)
}

const followUpMigrationSource = await fs.readFile(new URL('../../supabase/migrations/202606240001_arch9_launch_follow_up_fields.sql', import.meta.url), 'utf8')
for (const marker of [
  'add column if not exists role_type text',
  'add column if not exists discussion_focus text',
  'add column if not exists preferred_time text',
  "source in ('event_qr', 'arch9_launch_qr')",
]) {
  assert.match(followUpMigrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Follow-up migration should include ${marker}`)
}

console.log('arch9 launch concierge diagnostics passed')
