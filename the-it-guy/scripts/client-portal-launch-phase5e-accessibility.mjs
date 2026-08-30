import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5e-accessibility.json', root), 'utf8'))

const blockers = []
for (const [check, evidence] of Object.entries(packet.requiredChecks || {})) {
  if (!Array.isArray(evidence.requirements) || evidence.requirements.length === 0) blockers.push(`${check}:requirements`)
  for (const persona of packet.personas || []) {
    if (evidence[`${persona}Result`] !== 'passed') blockers.push(`${check}:${persona}Result`)
  }
  for (const field of ['testedBy', 'testedAt', 'evidenceUrl']) {
    if (!String(evidence[field] || '').trim()) blockers.push(`${check}:${field}`)
  }
}
if (packet.openCritical !== 0) blockers.push('defects:openCritical')
if (packet.openHigh !== 0) blockers.push('defects:openHigh')

const decision = blockers.length === 0 ? 'ACCESSIBILITY_CERTIFIED' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  standard: packet.standard,
  decision,
  candidate: packet.candidate,
  requiredChecks: Object.keys(packet.requiredChecks || {}),
  blockers
}, null, 2))

if (enforce && decision !== 'ACCESSIBILITY_CERTIFIED') process.exit(1)
