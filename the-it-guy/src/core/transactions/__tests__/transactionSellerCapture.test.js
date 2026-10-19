import { expect, it } from 'vitest'
import { buildTransactionSellerCapture, sellerCaptureDraft } from '../transactionSellerCapture.js'
const primary = '00000000-0000-4000-8000-000000000001'
const context = { profile: {}, details: { name: 'Jamie Seller', email: 'old@example.test' } }
let counter = 20
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`
it('roundtrips personal, spouse and FICA answers with stable transaction person IDs', () => {
  const draft = { ...sellerCaptureDraft(context), branch: 'married', sellerFirstName: 'New', sellerSurname: 'Seller', maritalStatus: 'married', maritalRegime: 'in_community', idNumber: 'seller-id', spouseName: 'Spouse Person', spouseIdNumber: 'spouse-id', occupation: 'Engineer', politicallyExposedPerson: 'no', popiConsent: 'Accepted' }
  const profile = buildTransactionSellerCapture(draft, context, primary, uuid)
  expect(profile.name).toBe('New Seller')
  expect(profile.people[0].id).toBe(primary)
  expect(profile.profileFields.popiConsent).toBeUndefined()
  const reopened = sellerCaptureDraft({ ...context, profile })
  expect(reopened.idNumber).toBe('seller-id')
  expect(reopened.spouseIdNumber).toBe('spouse-id')
  expect(reopened.occupation).toBe('Engineer')
  expect(buildTransactionSellerCapture(reopened, { ...context, profile }, primary, uuid).people.map(person=>person.id)).toEqual(profile.people.map(person=>person.id))
})
it.each(['company','trust','multiple_owners','foreign_individual','deceased_estate','power_of_attorney'])('retains the full %s capture through the shared editor model', branch => {
  const draft = { ...sellerCaptureDraft(context), branch, companyName: 'Entity Ltd', companyRegistrationNumber: 'company-reg', companyDirectors: [{id:'director-local', name:'Director', phone:'0111111111'}], trustName:'Family Trust', trustRegistrationNumber:'trust-reg', trustees:[{id:'trustee-local',name:'Trustee',phone:'0222222222'}], multipleOwners:[{id:'owner-local',name:'First Owner',phone:'0333333333'}], foreignPassportNumber:'passport-id', deceasedEstateName:'Estate', estateReferenceNumber:'estate-ref', executorName:'Executor', powerOfAttorneyPrincipalName:'Principal', powerOfAttorneyName:'Representative' }
  const profile = buildTransactionSellerCapture(draft, context, primary, uuid)
  const reopened = sellerCaptureDraft({ ...context, profile })
  expect(reopened.branch).toBe(branch)
  if (branch==='company') expect(reopened.companyDirectors[0].phone).toBe('0111111111')
  if (branch==='trust') expect(reopened.trustees[0].phone).toBe('0222222222')
  if (branch==='multiple_owners') expect(reopened.multipleOwners[0].phone).toBe('0333333333')
  if (branch==='foreign_individual') { expect(reopened.foreignPassportNumber).toBe('passport-id'); expect(profile.people.find(person=>person.isOwner).identityNumber).toBe('passport-id') }
  if (branch==='deceased_estate') expect(reopened.executorName).toBe('Executor')
  if (branch==='power_of_attorney') expect(reopened.powerOfAttorneyName).toBe('Representative')
})

it('preserves an earlier singleton capture that omitted the owner boolean', () => {
  const draft = sellerCaptureDraft({ ...context, profile: { entityType: 'individual', people: [{ id: primary, name: 'Saved Owner', primaryContact: true, identityNumber: 'existing-id', residentialAddress: 'Existing address', maritalStatus: 'single' }] } })
  expect(draft.idNumber).toBe('existing-id')
  expect(draft.residentialAddress).toBe('Existing address')
  expect(draft.sellerFirstName).toBe('Saved')
})
