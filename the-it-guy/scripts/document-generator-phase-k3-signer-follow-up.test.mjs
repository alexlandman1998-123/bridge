import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const timeline = await readFile(new URL('../src/components/documents/SigningProgressTimeline.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8')
const email = await readFile(new URL('../../supabase/functions/send-email/handlers/sellerMandateSent.ts', import.meta.url), 'utf8')

assert.match(timeline, /Send reminder|row\.action\.key === 'remind'/)
assert.match(workspace, /signer_reminder_sent/)
assert.match(workspace, /signingRemindersByRole/)
assert.match(workspace, /\$\{window\.location\.origin\}\/sign\/\$\{token\}/)
assert.match(page, /reminder: Boolean\(reminder\)/)
assert.match(email, /existing secure signing link remains active/i)
assert.doesNotMatch(workspace.match(/eventType: 'signer_reminder_sent'[\s\S]{0,800}/)?.[0] || '', /signing_token|portalLink/)

console.log('Document generator K3 signer follow-up and reminder-safety contract passed.')
