import { readFile } from 'node:fs/promises'

const enforce = process.argv.includes('--enforce')
const root = new URL('../', import.meta.url)
const contract = JSON.parse(await readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8'))
const packet = JSON.parse(await readFile(new URL('config/client-portal-launch-phase5d-capability-parity.json', root), 'utf8'))

const mappingById = new Map(packet.surfaceMappings.map((surface) => [surface.id, surface]))
const blockers = []
let requiredComparisons = 0

for (const surface of contract.surfaces) {
  const mapping = mappingById.get(surface.id)
  if (!mapping) {
    blockers.push(`mapping:${surface.id}`)
    continue
  }
  if (!String(mapping.desktopPath || '').trim()) blockers.push(`desktop_path:${surface.id}`)
  if (!String(mapping.mobilePath || '').trim()) blockers.push(`mobile_path:${surface.id}`)
  for (const persona of surface.personas) {
    requiredComparisons += 1
    if (!mapping.personas.includes(persona)) blockers.push(`mapping:${persona}:${surface.id}`)
    const evidence = packet.evidence?.[persona]?.[surface.id]
    if (!evidence) {
      blockers.push(`evidence:${persona}:${surface.id}`)
      continue
    }
    for (const result of ['desktopResult', 'mobileResult', 'sameDataResult']) {
      if (evidence[result] !== 'passed') blockers.push(`${result}:${persona}:${surface.id}`)
    }
    if (!String(evidence.evidenceUrl || '').trim()) blockers.push(`evidence_url:${persona}:${surface.id}`)
  }
}

if ((packet.approvedExceptions || []).length) blockers.push('approved_exceptions_require_product_owner_review')

const decision = blockers.length === 0 ? 'CAPABILITY_PARITY_CERTIFIED' : 'HOLD'
console.log(JSON.stringify({
  contract: packet.contractId,
  decision,
  candidate: packet.candidate,
  requiredSurfaces: contract.surfaces.length,
  requiredComparisons,
  approvedExceptions: packet.approvedExceptions,
  blockers
}, null, 2))

if (enforce && decision !== 'CAPABILITY_PARITY_CERTIFIED') process.exit(1)
