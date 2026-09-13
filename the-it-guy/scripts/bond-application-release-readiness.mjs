import { getBondApplicationSigningAvailability } from '../src/modules/bond/application/submission/bondApplicationSigningAvailability.js'
import { BOND_ORIGINATOR_REQUIREMENT_PROFILE_REGISTRY } from '../src/modules/bond/application/originatorRequirements/bondOriginatorRequirementProfiles.js'
import { BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED } from '../src/modules/bond/application/submission/bondApplicationDeclarations.js'

const signing = getBondApplicationSigningAvailability()
const blockers = []
if (!signing.available) blockers.push({ code: signing.code, message: 'A supported signing workflow must replace the retired packet signing system.' })
if (!BOND_ORIGINATOR_REQUIREMENT_PROFILE_REGISTRY.length) blockers.push({ code: 'originator_acceptance_required', message: 'Confirm the originator requirement profile and accept a representative application pack.' })
if (!BOND_APPLICATION_SURETY_DECLARATIONS_APPROVED) blockers.push({ code: 'surety_approval_required', scope: 'surety applications', message: 'Approved surety declarations and signing authority are still required.' })
blockers.push({ code: 'live_verification_required', message: 'Apply the reviewed migrations to the approved test environment, then verify authenticated buyer/originator access, file storage, signing and submission history.' })
console.log(JSON.stringify({ status: 'NOT_READY_FOR_RELEASE', localChecksAreNotLiveCertification: true, automaticBankSubmission: false, blockers }, null, 2))
if (process.argv.includes('--require-ready')) process.exitCode = 1
