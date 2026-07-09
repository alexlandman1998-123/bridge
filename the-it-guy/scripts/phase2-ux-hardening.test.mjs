import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  getMobileCreateFieldLimit,
  validateMobileCreateForm,
} from '../src/components/mobile-shell/mobileCreateConfig.js'

function assertInvalid(type, form, expectedMessage) {
  const result = validateMobileCreateForm(type, form)
  assert.equal(result.ok, false, `${type} form should be invalid`)
  assert.ok(
    result.errors.some((error) => error.includes(expectedMessage)),
    `${type} form should include "${expectedMessage}", got: ${result.errors.join(' | ')}`,
  )
}

function assertValid(type, form) {
  const result = validateMobileCreateForm(type, form)
  assert.equal(result.ok, true, `${type} form should be valid: ${result.errors.join(' | ')}`)
}

assertInvalid('lead', {}, 'Lead name is required')
assertInvalid('lead', { primary: 'Jane Buyer', secondary: 'not contactable' }, 'usable phone number or email')
assertValid('lead', { primary: 'Jane Buyer', secondary: 'jane@example.com', notes: 'Looking in Waterkloof' })
assertValid('lead', { primary: 'Jane Buyer', secondary: '082 555 0101' })

assertInvalid('prospect', { primary: 'Owner prospect' }, 'source or area or prospecting note')
assertValid('prospect', { primary: 'Owner prospect', secondary: 'Canvassing - Brooklyn' })
assertValid('prospect', { primary: 'Owner prospect', notes: 'Wants valuation next month' })

assertInvalid('transaction', { primary: 'Smith sale' }, 'property or reference or deal note')
assertValid('transaction', { primary: 'Smith sale', secondary: '12 Main Road' })

assertInvalid('note', {}, 'note title or note')
assertValid('note', { notes: 'Buyer asked for second viewing' })

assertInvalid('follow-up', { primary: 'Call seller' }, 'Due is required')
assertValid('follow-up', { primary: 'Call seller', secondary: 'Tomorrow 09:00' })

assert.equal(getMobileCreateFieldLimit('primary'), 80, 'primary field limit should stay compact for mobile')
assert.equal(getMobileCreateFieldLimit('notes'), 1200, 'notes should allow useful field context')

const createSheetSource = readFileSync(new URL('../src/components/mobile-shell/MobileCreateSheet.jsx', import.meta.url), 'utf8')
assert.match(createSheetSource, /validateMobileCreateForm/, 'mobile create sheet should use shared validation')
assert.match(createSheetSource, /saveMobileCreateDraft/, 'mobile create sheet should persist partial drafts durably')
assert.match(createSheetSource, /beforeunload/, 'mobile create sheet should protect refresh with an unsaved draft')
assert.match(createSheetSource, /Discard this draft\?/, 'mobile create sheet should ask before discarding typed work')
assert.match(createSheetSource, /type=\{savedDraft \? 'button' : 'submit'\}/, 'mobile create sheet should prevent duplicate submit after save')

const accessStateSource = readFileSync(new URL('../src/components/access/AccessState.jsx', import.meta.url), 'utf8')
assert.match(accessStateSource, /DEFAULT_ACTIONS/, 'access states should keep default recovery actions')
assert.match(accessStateSource, /Back to dashboard/, 'access states should offer a dashboard recovery path')
assert.match(accessStateSource, /Account settings/, 'access states should offer an account/settings recovery path')

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const hqRouteSource = appSource.slice(appSource.indexOf('function HQRoute'), appSource.indexOf('function OrganisationSettingsManageRoute'))
assert.match(hqRouteSource, /Founder HQ access required/, 'HQ guard should explain blocked founder access')
assert.doesNotMatch(hqRouteSource, /<Navigate to="\/dashboard" replace \/>/, 'HQ guard should not silently bounce to dashboard')

console.log('Phase 2 UX hardening checks passed')
