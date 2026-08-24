import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveClientPortalProfile,
} from '../src/core/clientPortal/clientPortalProfile.js'

const clientPortalSource = readFileSync(
  new URL('../src/pages/ClientPortal.jsx', import.meta.url),
  'utf8',
)
const apiSource = readFileSync(
  new URL('../src/lib/api.js', import.meta.url),
  'utf8',
)

function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextExport = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, nextExport === -1 ? source.length : nextExport)
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('canonical profile exposes distinct support labels by buyer portal type', () => {
  const developerProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'internal_developer_sale',
      development_id: 'dev-1',
    },
  })
  const agencyDevelopmentProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'developer_sale',
      sale_route: 'external_agency_sale',
      source_agency_org_id: 'agency-1',
      development_id: 'dev-1',
    },
  })
  const resaleProfile = resolveClientPortalProfile({
    workspace: 'buying',
    transaction: {
      transaction_type: 'private_property',
      sale_route: 'private_property_sale',
    },
  })

  assert.equal(developerProfile.supportLabels.primarySupportLabel, 'Developer Sales Team')
  assert.equal(agencyDevelopmentProfile.supportLabels.primarySupportLabel, 'Introducing Agency')
  assert.equal(agencyDevelopmentProfile.supportLabels.developerSupportLabel, 'Developer Operations')
  assert.equal(resaleProfile.supportLabels.primarySupportLabel, 'Agency / Agent')
  assert.equal(resaleProfile.supportLabels.operationsSupportLabel, 'Conveyancing Team')
})

test('client portal fetches assigned-agent contact fields for support cards', () => {
  for (const functionName of ['fetchClientPortalByToken', 'fetchClientPortalCoreByToken']) {
    const body = functionBody(apiSource, functionName)
    const primarySelect = body.match(/\.select\(\s*'([^']+)'/)?.[1] || ''

    for (const field of ['assigned_agent', 'assigned_agent_email']) {
      assert.match(
        primarySelect,
        new RegExp(`(?:^|, )${field}(?:,|$)`),
        `${functionName} primary transaction select should include ${field}`,
      )
      assert.match(
        body,
        new RegExp(`isMissingColumnError\\(transactionQuery\\.error, '${field}'\\)`),
        `${functionName} should safely fall back if ${field} is missing`,
      )
    }
  }
})

test('client portal builds team cards from canonical support labels', () => {
  assert.match(clientPortalSource, /const buyerPortalSupportLabels =/)
  assert.match(clientPortalSource, /buyerPortalSupportLabels\.primarySupportLabel/)
  assert.match(clientPortalSource, /const buyerPrimaryTeamMember =/)
  assert.match(clientPortalSource, /const buyerDeveloperOperationsMember = portalProfile\?\.isAgencyIntroducedDevelopmentPortal/)
  assert.match(clientPortalSource, /const buyerOperationsSupportMember =/)
  assert.match(clientPortalSource, /const teamMembers = \[/)
  assert.match(clientPortalSource, /buyerPrimaryTeamMember/)
  assert.match(clientPortalSource, /buyerDeveloperOperationsMember/)
  assert.match(clientPortalSource, /buyerOperationsSupportMember/)
})

test('team page and sidebar use resolved support context labels', () => {
  assert.match(clientPortalSource, /const buyerTeamHeading = resolveBuyerPortalLabel\('team', 'Your team'\)/)
  assert.match(clientPortalSource, /const buyerTeamDescription = portalProfile\?\.isAgencyIntroducedDevelopmentPortal/)
  assert.match(clientPortalSource, /const buyerPortalBrandName = pickFirstText/)
  assert.match(clientPortalSource, /\{buyerTeamHeading\}/)
  assert.match(clientPortalSource, /\{buyerTeamDescription\}/)
  assert.match(clientPortalSource, /\{buyerPortalBrandName\}/)
  assert.match(clientPortalSource, /\{buyerPortalBrandDescriptor\}/)
})

test('bond originator support card only appears when finance context needs it', () => {
  assert.match(
    clientPortalSource,
    /isBondOrHybridTransaction \|\| portal\?\.transaction\?\.bond_originator \|\| portal\?\.transaction\?\.assigned_bond_originator_email/,
  )
})
