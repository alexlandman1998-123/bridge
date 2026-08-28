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
const referralMigrationSource = await fs.readFile(new URL('../../supabase/migrations/202606240002_arch9_launch_referral_clicks.sql', import.meta.url), 'utf8')

assert.match(appSource, /Arch9LaunchConcierge/, 'App should lazy-load the Arch9 launch concierge page')
for (const route of ['/arch9-launch', '/launch/arch9', '/qr/arch9']) {
  assert.match(appSource, new RegExp(`path="${route.replaceAll('/', '\\/')}"`), `${route} should be wired for QR-friendly sharing`)
}

for (const copy of [
  'THE TRANSACTION OPERATING SYSTEM',
  'Your entire',
  'real estate',
  'Get your personalised demo',
  'Let&apos;s tailor Arch9 to your business',
  'Takes less than 60 seconds',
  'Start now',
  'What best describes you?',
  'Tell us about yourself',
  'Tell us about your business',
  'What would you like to see?',
  "What's your biggest frustration today?",
  'Almost there!',
  'Email me my demo',
  'Book a time with our team',
  'DEMO_FLOW_CONFIG',
  'commercial_agency',
  'Active developments',
  'Monthly property matters',
  'sessionStorage',
  'demo_landing_view',
  'demo_started',
  'demo_booking_selected',
  'demo_completed',
  "'Lead'",
  '100dvh',
  'safe-area-inset-bottom',
  'motion-reduce',
]) {
  assert.match(pageSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Launch page should include: ${copy}`)
}

for (const removedCopy of [
  'DOMAIN_LABEL',
  'app.arch9.co.za</',
  'Step 1 of 4',
  'Select up to 2.',
]) {
  assert.doesNotMatch(pageSource, new RegExp(removedCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Launch page should not include redundant footer copy: ${removedCopy}`)
}

for (const marker of [
  '<title>%VITE_DOCUMENT_TITLE%</title>',
  'A modern property experience for buyers and sellers.',
  'https://app.arch9.co.za/brand/future-of-property-preview.jpg',
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
  "type: 'arch9_launch_internal_notification'",
  "to: 'alexlandman1998@gmail.com'",
  "confirmation email failed",
  "internal notification email failed",
  'launch_event_referral_clicks',
  'recordLaunchReferralClick',
  'captureLaunchAttribution',
  'ATTRIBUTION_SESSION_KEY',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'business_size',
  'monthly_transactions',
  'preferred_next_action',
  'personalisedDemo',
]) {
  assert.match(serviceSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Lead service should include ${marker}`)
}

for (const marker of [
  'handleArch9LaunchConfirmationEmail',
  'handleArch9LaunchInternalNotificationEmail',
  'arch9_launch_confirmation',
  'arch9_launch_internal_notification',
]) {
  assert.match(sendEmailIndexSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `send-email index should include ${marker}`)
}

for (const marker of [
  'SendArch9LaunchConfirmationPayload',
  'SendArch9LaunchInternalNotificationPayload',
  'arch9_concierge_confirmation',
  'arch9_concierge_internal_notification',
]) {
  assert.match(sendEmailTypesSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `send-email types should include ${marker}`)
}

for (const marker of [
  'Thank you. We’ll be in contact shortly.',
  'We’ve received your request for a private Arch9 strategy session.',
  'New concierge request',
  'arch9_launch_internal_notification',
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

for (const marker of [
  'create table if not exists public.launch_event_referral_clicks',
  "action in ('whatsapp', 'copy_link')",
  'Launch guests can count referral clicks',
  'grant insert on public.launch_event_referral_clicks to anon',
  'Authenticated team can read referral clicks',
]) {
  assert.match(referralMigrationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Referral migration should include ${marker}`)
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
