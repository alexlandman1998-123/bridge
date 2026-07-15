import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  DEFAULT_BRANDING,
  DEFAULT_DEPARTMENTS,
  buildLaunchPacket,
  buildOnboardingGuidance,
  getActiveDepartmentTypes,
} from '../src/components/attorney/onboarding/attorneyOnboardingGuidance.js'

const activeDepartmentTypes = getActiveDepartmentTypes(DEFAULT_DEPARTMENTS)

const guidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
    email: 'ops@kingstons.co.za',
    phone: '+27 11 555 0180',
    website: 'kingstons.co.za',
  },
  branding: {
    ...DEFAULT_BRANDING,
    logoUrl: 'https://cdn.example.com/kingstons-logo.png',
    primaryColour: '#123456',
    secondaryColour: '#abcdef',
  },
  activeDepartmentTypes,
  invites: [
    {
      id: 'invite-transfer',
      email: 'transfer@kingstons.co.za',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
  ],
})

const packet = guidance.activationDossier.launchPacket

assert.equal(packet.title, 'Kingstons Legal Launch Packet')
assert.equal(packet.nextAction, 'Activate workspace')
assert.equal(packet.inviteCount, 1)
assert.match(packet.text, /^Kingstons Legal Launch Packet/)
assert.match(packet.text, /Status: Launch dossier is ready/)
assert.match(packet.text, /- Primary colour: #123456/)
assert.match(packet.text, /- Active lanes: Transfer Department, Bond Department, Bond Cancellation Department, Admin Department, Management/)
assert.match(packet.text, /- Team access: Ready - 1 invite prepared\./)
assert.match(packet.text, /- transfer@kingstons\.co\.za - Transfer Attorney \/ Transfer Department/)

const blockedGuidance = buildOnboardingGuidance({
  firmInformation: {
    name: 'Kingstons Legal',
  },
  branding: DEFAULT_BRANDING,
  activeDepartmentTypes,
  invites: [
    {
      id: 'invite-1',
      email: 'bad-email',
      role: 'transfer_attorney',
      departmentType: 'transfer',
    },
  ],
})

assert.equal(blockedGuidance.activationDossier.launchPacket.nextAction, 'Fix Team access')
assert.match(blockedGuidance.activationDossier.launchPacket.text, /Next action: Fix Team access/)
assert.match(blockedGuidance.activationDossier.launchPacket.text, /- Team access: Needs attention - Resolve invite email, role, or department issues\./)

const emptyPacket = buildLaunchPacket()
assert.equal(emptyPacket.title, 'Attorney Firm Launch Packet')
assert.match(emptyPacket.text, /- Logo: Pending/)
assert.match(emptyPacket.text, /- None queued/)

const reviewSource = readFileSync(new URL('../src/components/attorney/onboarding/ReviewConfirmStep.jsx', import.meta.url), 'utf8')

assert.match(
  reviewSource,
  /navigator\.clipboard\.writeText\(launchPacket\.text\)/,
  'The review step should copy the generated launch packet text.',
)

assert.match(
  reviewSource,
  /className="attorney-dossier-copy-action"[\s\S]*Copy launch packet/,
  'The review hero should expose the launch packet copy action.',
)

assert.match(
  reviewSource,
  /Launch packet copied/,
  'The review step should confirm when the packet is copied.',
)

console.log('attorney onboarding phase 7 launch packet contracts passed')
