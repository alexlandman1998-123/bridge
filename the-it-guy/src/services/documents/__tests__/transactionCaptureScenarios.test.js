import { expect, it, vi } from 'vitest'
import { DOCUMENT_REQUEST_CANONICAL_MATRIX } from '../../../core/documents/documentRequestCanonicalMatrix.js'
import { buildTransactionPartiesSnapshot, createTransactionPartyPerson, getTransactionParties, transactionPartiesOnboardingSeed, transactionPartyMissingDetails } from '../../../core/transactions/transactionPartyProfile.js'
import { buildTransactionCaptureFinance, splitTransactionCaptureRolePlayers } from '../../../core/transactions/transactionCaptureFinance.js'
import { saveTransactionCaptureDocuments, transactionCaptureDocumentOptions } from '../../../core/transactions/transactionCaptureDocuments.js'
import { buildProjectedTransactionRequirementCandidates } from '../transactionCanonicalDocumentRequirementService.js'

const owner = (name, maritalStatus = 'single', maritalRegime = 'unknown') => ({ ...createTransactionPartyPerson(), name, maritalStatus, maritalRegime })
const personScenarios = [
  ['single', 'individual', 'single'], ['divorced', 'individual', 'divorced'], ['widowed', 'individual', 'widowed'],
  ['married in community', 'individual', 'married', 'in_community'],
  ['married without accrual', 'individual', 'married', 'out_of_community'],
  ['married with accrual', 'individual', 'married', 'out_of_community_with_accrual'],
  ['foreign marriage', 'individual', 'married', 'foreign_marriage'],
  ['co-owners with different marriages', 'multiple_owners', 'married', 'in_community'],
  ['foreign individual', 'foreign_individual', 'single'],
  ['company', 'company'], ['CC', 'close_corporation'], ['trust', 'trust'],
  ['foreign company', 'foreign_company'], ['foreign trust', 'foreign_trust'], ['unknown entity', 'unknown'],
  ['buyer company / seller estate', 'company', undefined, undefined, 'deceased_estate'],
]
const definitions = DOCUMENT_REQUEST_CANONICAL_MATRIX.requirements.map((row) => ({ key: row.key, display_label: row.label,
  pack_key: row.key.startsWith('seller_') ? 'seller_identity_fica' : 'buyer_identity_fica', default_visibility: ['agent'], default_upload_roles: ['agent'] }))
const scenarios = personScenarios.flatMap((person) => ['cash', 'bond', 'combination', 'unknown'].flatMap((financeType) =>
  ['yes', 'no', 'unknown'].map((sellerBondStatus) => ({ name: `${person[0]} / ${financeType} / seller bond ${sellerBondStatus}`, person, financeType, sellerBondStatus }))))

it.each(scenarios)('round-trips capture, resolves evidence and routes professionals: $name', async ({ person: [, entityType, maritalStatus, maritalRegime, sellerOverride], financeType, sellerBondStatus }) => {
  const natural = ['individual', 'multiple_owners', 'foreign_individual'].includes(entityType)
  const first = owner('Jane', maritalStatus, maritalRegime)
  if (!natural) Object.assign(first, { role: entityType.includes('trust') ? 'trustee' : 'director', isOwner: false })
  const people = [first]
  if (maritalRegime === 'in_community') people.push({ ...createTransactionPartyPerson('spouse'), name: 'Pat', spouseOfId: first.id })
  if (entityType === 'multiple_owners') people.push(owner('Alex', 'married', 'out_of_community_with_accrual'))
  const sellerType = sellerOverride || entityType
  const sellerIds = new Map(people.map((person) => [person.id, crypto.randomUUID()]))
  const sellerPeople = sellerOverride ? [{ ...createTransactionPartyPerson('executor'), name: 'Executor' }]
    : people.map((person) => ({ ...person, id: sellerIds.get(person.id), name: `Seller ${person.name}`, spouseOfId: sellerIds.get(person.spouseOfId) || null }))
  const parties = buildTransactionPartiesSnapshot({ buyer: { entityType, name: 'Purchaser entity', registrationNumber: 'REG1', people },
    seller: { entityType: sellerType, name: 'Seller entity', registrationNumber: 'EST1', people: sellerPeople } })
  const capture = buildTransactionCaptureFinance({ financeType, financeManagedBy: 'bond_originator', financeBank: 'Buyer bank', bondStatus: 'submitted',
    cashAmount: financeType === 'combination' ? '200000' : '1000000', bondAmount: financeType === 'combination' ? '800000' : '1000000', depositAmount: '0', sellerBondStatus, sellerBondBank: 'Seller bank' }, 1000000)
  const formData = JSON.parse(JSON.stringify({ ...transactionPartiesOnboardingSeed(parties), __bridge_finance: { captureSnapshot: capture.snapshot } }))
  expect(getTransactionParties(formData)).toEqual(parties)
  if (entityType.startsWith('foreign_') || maritalRegime === 'foreign_marriage' || entityType === 'unknown') {
    expect(transactionPartyMissingDetails(parties.buyer).length).toBeGreaterThan(0)
  }
  const { candidates } = buildProjectedTransactionRequirementCandidates({ transaction: { id: 'captured', finance_type: capture.snapshot.type }, formData, definitions, rules: [] })
  const keys = candidates.map((row) => row.generated.document_definition_key)
  if (sellerType === 'deceased_estate') expect(keys).toContain('seller_executor_authority')
  if (['company', 'close_corporation', 'foreign_company'].includes(sellerType)) expect(keys).toContain('seller_company_registration')
  if (['trust', 'foreign_trust'].includes(sellerType)) expect(keys).toContain('seller_trust_deed')
  if (maritalStatus === 'married' && maritalRegime !== 'foreign_marriage') expect(keys).toContain('seller_marriage_certificate')
  if (['company', 'close_corporation', 'foreign_company'].includes(entityType)) expect(keys).toContain('buyer_company_registration')
  if (['trust', 'foreign_trust'].includes(entityType)) expect(keys).toContain('buyer_trust_deed')
  if (maritalStatus === 'married' && maritalRegime !== 'foreign_marriage') expect(keys).toContain('buyer_marriage_certificate')
  const options = transactionCaptureDocumentOptions(parties, capture.snapshot.type, sellerBondStatus === 'yes')
  expect(options.some((row) => row.key === 'bond_statement')).toBe(sellerBondStatus === 'yes')
  expect(options.some((row) => row.key === 'bond_approval')).toBe(['bond', 'combination'].includes(financeType))
  const identity = options.filter((row) => ['buyer_id_document', 'buyer_passport', 'seller_id_document', 'seller_passport'].includes(row.key) && row.partyId)
  if (natural) expect(identity.length).toBeGreaterThan(0)
  if (!natural) expect(identity).toHaveLength(0)
  const requirements = candidates.map((row, index) => ({ key: row.generated.document_definition_key,
    partyId: row.generated.requested_from_contact_id || null, canonicalRequirementInstanceId: `requirement-${index}` }))
  const upload = vi.fn(async () => ({ id: 'file' }))
  const entries = identity.map((row) => ({ ...row, id: row.value, file: { name: `${row.partyId}.pdf` } }))
  const saved = await saveTransactionCaptureDocuments({ transactionId: 'captured', entries, requirements, upload })
  expect(saved.every((row) => row.status === 'saved' && !row.needsMatching)).toBe(true)
  for (const [{ canonicalRequirementInstanceId, uploadedByParty, source, isClientVisible }] of upload.mock.calls) {
    expect(requirements.find((row) => row.canonicalRequirementInstanceId === canonicalRequirementInstanceId)?.partyId).toBe(uploadedByParty)
    expect(source).toBe('transaction_capture')
    expect(isClientVisible).toBe(false)
  }
  const selections = ['transfer_attorney', 'bond_originator', 'bond_attorney', 'cancellation_attorney'].map((roleType) => ({ roleType, partnerOrganisationId: 'firm' }))
  const routed = splitTransactionCaptureRolePlayers(selections, { financeType, financeManagedBy: 'bond_originator', sellerBondStatus })
  const expected = ['transfer_attorney', ...(['bond', 'combination'].includes(financeType) ? ['bond_originator', 'bond_attorney'] : []), ...(sellerBondStatus === 'yes' ? ['cancellation_attorney'] : [])]
  expect(routed.connected.map((row) => row.roleType)).toEqual(expected)
  expect(routed.invitations).toHaveLength(0)
})
