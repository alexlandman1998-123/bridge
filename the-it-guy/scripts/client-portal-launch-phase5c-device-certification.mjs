import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5c-device-certification.json', root), 'utf8'))

const blockers = []
for (const platform of ['ios', 'android']) {
  const device = packet.devices?.[platform]
  if (!device?.required) blockers.push(`${platform}:not-required`)
  for (const field of ['device', 'osVersion', 'browser', 'browserVersion', 'testedBy', 'testedAt', 'evidenceUrl']) {
    if (!String(device?.[field] || '').trim()) blockers.push(`${platform}:${field}`)
  }
  for (const persona of ['buyerResult', 'sellerResult']) {
    if (device?.[persona] !== 'passed') blockers.push(`${platform}:${persona}`)
  }
}

const decision = blockers.length === 0 ? 'PHYSICAL_DEVICES_CERTIFIED' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  decision,
  candidate: packet.candidate,
  requiredChecks: packet.requiredChecks,
  blockers
}, null, 2))

if (enforce && decision !== 'PHYSICAL_DEVICES_CERTIFIED') process.exit(1)
