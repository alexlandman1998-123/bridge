import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150011_bank_legal_instruction_phase5.sql', import.meta.url),
  'utf8',
)
const page = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)

assert.match(migration, /instruction_issuer text/)
assert.match(migration, /instruction_issuer = 'bank'/)
assert.match(migration, /instruction_reference text/)
assert.match(migration, /instruction_evidence_document_id uuid/)
assert.match(migration, /bridge_confirm_bank_legal_instruction/)
assert.match(migration, /coordination_state = 'instruction_confirmed'/)
assert.match(migration, /instruction_status = 'ready_for_acceptance'/)
assert.match(migration, /bridge_decide_bank_legal_instruction/)
assert.match(migration, /staff_assignment_status <> 'staff_assigned'/)
assert.match(migration, /coordination_state = 'active'/)
assert.match(migration, /instruction_status = 'accepted'/)
assert.match(migration, /coordination_state = 'replacement_required'/)
assert.match(migration, /A reason is required when declining a bank instruction/)
assert.match(migration, /revoke all on function public\.bridge_confirm_bank_legal_instruction/)
assert.match(migration, /eventName', 'legal_role_instruction_confirmed'/)
assert.match(migration, /'legal_role_activated'/)
assert.match(migration, /'legal_role_replacement_required'/)

assert.match(page, /Record Bank Instruction/)
assert.match(page, /Accept Instruction/)
assert.match(page, /Assign a primary attorney before accepting and activating this role/)

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
  root: projectRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { validateBankLegalInstructionDraft } = await server.ssrLoadModule('/src/services/legalRoleAppointmentService.js')
  const valid = validateBankLegalInstructionDraft({
    appointmentId: 'appointment-1',
    instructionReference: 'BANK-INSTR-123',
    instructionSource: 'instruction_document',
    evidenceConfirmed: true,
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.draft.instructionSource, 'instruction_document')

  const missingBankEvidence = validateBankLegalInstructionDraft({
    ...valid.draft,
    evidenceConfirmed: false,
  })
  assert.equal(missingBankEvidence.valid, false)
  assert.match(missingBankEvidence.errors.evidenceConfirmed, /appointing bank/i)

  const invalidSource = validateBankLegalInstructionDraft({
    ...valid.draft,
    instructionSource: 'transfer_attorney',
  })
  assert.equal(invalidSource.valid, false)
  assert.match(invalidSource.errors.instructionSource, /valid bank instruction source/i)
} finally {
  await server.close()
}

console.log('bank legal instruction Phase 5 contracts passed')
