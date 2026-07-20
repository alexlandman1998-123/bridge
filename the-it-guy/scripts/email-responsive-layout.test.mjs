import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const emailRoot = new URL('../../supabase/functions/send-email/', import.meta.url)
const passwordRecoveryUrl = new URL('../../supabase/functions/seller-portal-password-recovery/index.ts', import.meta.url)
const propertyCollectionUrl = new URL('../src/services/leadPropertySharingService.js', import.meta.url)

async function readEmailFile(path) {
  return readFile(new URL(path, emailRoot), 'utf8')
}

const [
  bridgeLayout,
  sellerOnboarding,
  organisationPartnerInvitation,
  workspaceInvite,
  passwordRecovery,
  propertyCollection,
] = await Promise.all([
  readEmailFile('content/bridgeEmailLayout.ts'),
  readEmailFile('content/sellerOnboarding.ts'),
  readEmailFile('handlers/organisationPartnerInvitation.ts'),
  readEmailFile('handlers/workspaceInvite.ts'),
  readFile(passwordRecoveryUrl, 'utf8'),
  readFile(propertyCollectionUrl, 'utf8'),
])

for (const [name, source, shellClass, maxWidth] of [
  ['shared email layout', bridgeLayout, 'bridge-shell', '660'],
  ['seller onboarding', sellerOnboarding, 'arch9-shell', '660'],
  ['organisation partner invitation', organisationPartnerInvitation, 'arch9-shell', '660'],
]) {
  assert.match(source, /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/, `${name} should declare a responsive viewport`)
  assert.ok(source.includes(`width="100%" class="${shellClass}"`), `${name} should use a fluid shell`)
  assert.ok(source.includes(`max-width: ${maxWidth}px`), `${name} should retain a desktop width cap`)
  assert.ok(source.includes('<!--[if mso]>'), `${name} should include an Outlook desktop fallback`)
  assert.match(source, /@media screen and \(max-width: 480px\)/, `${name} should retain mobile layout rules`)
}

assert.match(workspaceInvite, /width="100%" style="width:100%;max-width:680px/, 'workspace invites should use a fluid shell')
assert.ok(workspaceInvite.includes('<!--[if mso]>'), 'workspace invites should include an Outlook desktop fallback')
assert.match(passwordRecovery, /<meta name="viewport" content="width=device-width, initial-scale=1\.0" \/>/, 'password recovery should declare a responsive viewport')
assert.match(passwordRecovery, /width:100%;max-width:620px/, 'password recovery should use a fluid shell')
assert.match(passwordRecovery, /box-sizing:border-box/, 'password recovery should keep padding inside the mobile viewport')
assert.match(propertyCollection, /class="collection-shell"/, 'property collections should use the responsive collection shell')
assert.match(propertyCollection, /@media screen and \(max-width: 640px\)/, 'property collection columns should stack on mobile')
assert.match(propertyCollection, /collection-property-action-col/, 'property collection action columns should have a mobile layout hook')
assert.ok(propertyCollection.includes('<!--[if mso]>'), 'property collections should include an Outlook desktop fallback')

for (const path of [
  'content/onboardingSubmitted.ts',
  'content/reservationDeposit.ts',
  'content/reservationDepositReceived.ts',
  'handlers/arch9LaunchConfirmation.ts',
  'handlers/commercialLandlordOnboarding.ts',
  'handlers/leadPropertyShare.ts',
]) {
  const source = await readEmailFile(path)
  assert.match(source, /width:\s*100%;\s*max-width:/, `${path} should fill narrow panes before applying its desktop cap`)
  assert.match(source, /box-sizing:\s*border-box/, `${path} should keep padding inside the mobile viewport`)
}

async function collectTypeScriptFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl)
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(entryUrl))
    else if (entry.name.endsWith('.ts')) files.push(entryUrl)
  }
  return files
}

for (const fileUrl of await collectTypeScriptFiles(emailRoot)) {
  const source = await readFile(fileUrl, 'utf8')
  assert.doesNotMatch(
    source,
    /width="(?:560|600|620|640|660|680)" class="(?:arch9|bridge)-shell"/,
    `${fileUrl.pathname} should not force a fixed-width shell in modern email clients`,
  )
}

console.log('Email responsive layout contract passed.')
