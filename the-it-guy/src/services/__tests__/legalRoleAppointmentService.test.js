import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const { validateBankLegalRoleAppointmentDraft } = await server.ssrLoadModule('/src/services/legalRoleAppointmentService.js')

const valid = validateBankLegalRoleAppointmentDraft({
  transactionId: 'transaction-1',
  roleType: 'cancellation_attorney',
  appointingBank: 'Example Bank',
  appointmentReference: 'BANK-REF-123',
  companyName: 'Appointed Attorneys',
  contactName: 'Case Manager',
  email: 'matters@example.test',
  evidenceConfirmed: true,
})
assert.equal(valid.valid, true)
assert.equal(valid.draft.roleType, 'cancellation_attorney')

const missingAuthorityEvidence = validateBankLegalRoleAppointmentDraft({
  ...valid.draft,
  evidenceConfirmed: false,
})
assert.equal(missingAuthorityEvidence.valid, false)
assert.match(missingAuthorityEvidence.errors.evidenceConfirmed, /bank/i)

const wrongRole = validateBankLegalRoleAppointmentDraft({
  ...valid.draft,
  roleType: 'transfer_attorney',
})
assert.equal(wrongRole.valid, false)
assert.match(wrongRole.errors.roleType, /bank-appointed/i)

console.log('legalRoleAppointmentService tests passed')
await server.close()
