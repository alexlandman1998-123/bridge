import { describe, expect, it } from 'vitest'
import { RENTAL_APPLICATION_FIELD_GROUPS, RENTAL_APPLICATION_SCHEMA_VERSION, RENTAL_APPLICATION_CURRENT_SECTIONS, mergeRentalApplicationData, extractReusableRentalTenantProfile, prefillRentalApplicationFromProfile, publicRentalApplicationData, validateRentalApplicationFields } from '../rentalApplicationFieldContract.js'
import { calculateRentalApplicationCompletion } from '../rentalApplicationModel.js'
import { isRentalApplicantPortalReadyToSubmit } from '../rentalApplicantPortalModel.js'
const complete = () => ({ schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION, entity: { type: 'individual' }, identity: { firstName: 'Alex', lastName: 'Tenant', email: 'a@example.test', identityNumber: 'test-id' }, employment: { employmentType: 'employed', employer: 'Acme' }, income: { monthlyIncome: 25000, otherIncome: 0 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' }, household: { occupantCount: 1, intendedOccupationDate: '2026-11-01' } })
describe('shared application fields', () => {
  it('defines unique fields and gives both forms the same current sections', () => {
    const paths = RENTAL_APPLICATION_FIELD_GROUPS.flatMap((group) => group.fields.map((item) => `${group.key}.${item.key}`))
    expect(new Set(paths).size).toBe(paths.length)
    expect(RENTAL_APPLICATION_CURRENT_SECTIONS.map((section) => section.key)).toEqual(['identity', 'employment', 'income', 'rentalHistory'])
  })
  it('round trips every defined field including zero, false, empty values and collections', () => {
    const data = Object.fromEntries(RENTAL_APPLICATION_FIELD_GROUPS.map((group) => {
      const fields = Object.fromEntries(group.fields.map((item) => [item.key, item.type === 'number' ? 0 : item.type === 'boolean' ? false : `${group.key}-${item.key}`]))
      return [group.key, group.collection ? [fields] : fields]
    }))
    const reopened = JSON.parse(JSON.stringify(mergeRentalApplicationData({}, data)))
    expect(reopened).toEqual(data)
    const cleared = mergeRentalApplicationData(reopened, { identity: { phone: '' }, income: { otherIncome: 0 }, household: { guarantorRequired: false }, people: [] })
    expect(cleared.identity.firstName).toBe(data.identity.firstName)
    expect(cleared.identity.phone).toBe('')
    expect(cleared.income.otherIncome).toBe(0)
    expect(cleared.household.guarantorRequired).toBe(false)
    expect(cleared.people).toEqual([])
  })
  it('separates profile reuse from property, financial answers, roles and consent', () => {
    const previous = { ...complete(), people: [{ id: 'g', role: 'guarantor' }], property: { vacancyId: 'old', monthlyRent: 12000 }, onboarding: { sentAt: 'old' }, consents: { credit: true }, decision: { approved: true } }
    const profile = extractReusableRentalTenantProfile(previous)
    expect(Object.keys(profile).sort()).toEqual(['entity', 'identity'])
    const next = prefillRentalApplicationFromProfile(previous, { property: { vacancyId: 'new' }, identity: { email: '' } })
    expect(next.property).toEqual({ vacancyId: 'new' })
    expect(next.identity.email).toBe('')
    for (const key of ['income', 'employment', 'people', 'onboarding', 'decision', 'consents']) expect(next[key]).toBeUndefined()
    next.identity.firstName = 'Different'
    expect(previous.identity.firstName).toBe('Alex')
  })
  it('protects server fields and preserves unknown stored metadata in applicant partial saves', () => {
    const saved = { identity: { firstName: 'Alex', lastName: 'Tenant', customStoredValue: 'keep' }, property: { monthlyRent: 12000 }, onboarding: { sentAt: 'saved' }, internalNotes: 'private' }
    const patched = mergeRentalApplicationData(saved, { identity: { firstName: 'Edited', verified: true }, property: { monthlyRent: 1 }, onboarding: { sentAt: 'forged' } }, { source: 'applicant' })
    expect(patched.identity).toEqual({ firstName: 'Edited', lastName: 'Tenant', customStoredValue: 'keep' })
    expect(patched.property.monthlyRent).toBe(12000)
    expect(patched.onboarding.sentAt).toBe('saved')
    expect(publicRentalApplicationData(patched).internalNotes).toBeUndefined()
    expect(publicRentalApplicationData(patched).identity.customStoredValue).toBeUndefined()
    expect(() => mergeRentalApplicationData(saved, { decision: 'approved' }, { source: 'applicant' })).toThrow('not applicant-editable')
    expect(() => mergeRentalApplicationData(saved, { identity: [] })).toThrow('must be an object')
    expect(() => mergeRentalApplicationData(saved, { people: {} })).toThrow('must be a list')
  })
  it.each(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])('validates the %s scenario', (type) => {
    const data = complete(); data.entity = { type, legalName: 'Tenant entity', registrationNumber: 'reg' }; data.income.incomeSource = 'Trading income'
    if (type !== 'individual') data.people = [{ id: 'person-2', firstName: 'Sam', identityNumber: 'support-id', email: 'sam@example.test', lastName: 'Person', role: type === 'joint_individuals' ? 'co_tenant' : type === 'trust' ? 'trustee' : 'authorised_signatory' }]
    expect(validateRentalApplicationFields(data)).toEqual([])
    if (type !== 'individual') { data.people = []; expect(validateRentalApplicationFields(data).length).toBeGreaterThan(0) }
  })
  it('checks guarantors, conditional income evidence and meaningful completion', () => {
    const data = complete(); data.household.guarantorRequired = true
    expect(validateRentalApplicationFields(data)).toContain('Add the guarantor.')
    data.people = [{ id: 'g', role: 'guarantor', firstName: 'Sam', identityNumber: 'support-id', email: 'sam@example.test', lastName: 'Guarantor' }]
    expect(validateRentalApplicationFields(data)).toEqual([])
    data.employment = { employmentType: 'student' }
    expect(validateRentalApplicationFields(data)).toContain('Income source is required.')
    const entity = complete(); entity.entity = { type: 'company', legalName: 'Company', registrationNumber: 'reg', primaryContactRole: 'authorised_signatory' }; entity.employment = {}; entity.income.incomeSource = 'Trading income'
    expect(validateRentalApplicationFields(entity)).toEqual([])
    const blank = { identity: { firstName: '' }, employment: { employmentType: '' }, income: { monthlyIncome: '' }, rentalHistory: { currentAddress: '' } }
    expect(calculateRentalApplicationCompletion({ data: blank }).ready).toBe(false)
    expect(isRentalApplicantPortalReadyToSubmit({ data: blank, documents: [{ document_type: 'identity', status: 'uploaded' }, { document_type: 'proof_of_income', status: 'uploaded' }], consents: { privacy: true, credit_check: true, identity_verification: true } })).toBe(false)
  })
})
