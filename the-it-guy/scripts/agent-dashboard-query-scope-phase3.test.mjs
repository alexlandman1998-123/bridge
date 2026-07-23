import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Keep this test self-contained: it exercises the public access helper through
// Supabase's REST client, while replacing only the network boundary.
process.env.VITE_SUPABASE_URL = 'https://phase3-query-scope.test.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.phase3-query-scope'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dashboardSource = readFileSync(path.join(PROJECT_ROOT, 'src/pages/Dashboard.jsx'), 'utf8')
const apiSource = readFileSync(path.join(PROJECT_ROOT, 'src/lib/api.js'), 'utf8')
const originalFetch = globalThis.fetch
const requests = []
let participantResponseMode = 'missing-columns'

function jsonResponse(payload, { status = 200, statusText = 'OK' } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function requestUrl(input) {
  if (typeof input === 'string') return new URL(input)
  if (input instanceof URL) return input
  return new URL(input.url)
}

function requestSummary(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  return {
    table: parts.at(-1),
    url,
    select: url.searchParams.get('select') || '',
  }
}

globalThis.fetch = async (input) => {
  const url = requestUrl(input)
  const request = requestSummary(url)
  requests.push(request)

  if (request.table === 'profiles') {
    return jsonResponse([
      {
        id: 'user-1',
        email: 'agent@example.test',
        full_name: 'Agent Example',
      },
    ])
  }

  if (request.table === 'transaction_participants') {
    const isScopedRelationQuery = request.select.includes('transaction:transactions!inner(organisation_id)')
    const isUserIdentity = url.searchParams.get('user_id') === 'eq.user-1'

    if (participantResponseMode === 'relationship-cache' && isScopedRelationQuery) {
      return jsonResponse(
        {
          code: 'PGRST200',
          message: 'Could not find a relationship between transaction_participants and transactions.',
        },
        { status: 400, statusText: 'Bad Request' },
      )
    }

    if (
      participantResponseMode === 'missing-columns' &&
      (request.select.includes('status') || request.select.includes('removed_at'))
    ) {
      return jsonResponse(
        {
          code: '42703',
          message: isUserIdentity
            ? 'column transaction_participants.status does not exist'
            : 'column transaction_participants.removed_at does not exist',
        },
        { status: 400, statusText: 'Bad Request' },
      )
    }

    if (isUserIdentity) {
      return jsonResponse([
        {
          transaction_id: 'tx-user',
          role_type: 'listing_agent',
          status: 'active',
          removed_at: null,
        },
      ])
    }

    return jsonResponse([
      {
        transaction_id: 'tx-email',
        role_type: 'estate_agent',
        status: 'active',
        removed_at: null,
      },
      ...(participantResponseMode === 'relationship-cache'
        ? [
            {
              transaction_id: 'tx-foreign',
              role_type: 'agent',
              status: 'active',
              removed_at: null,
            },
          ]
        : []),
    ])
  }

  if (request.table === 'transactions') {
    if (url.searchParams.has('assigned_agent_email')) {
      return jsonResponse([{ id: 'tx-legacy', is_active: true }])
    }

    if (url.searchParams.has('id')) {
      return jsonResponse([
        { id: 'tx-user', is_active: true },
        { id: 'tx-email', is_active: true },
      ])
    }
  }

  return jsonResponse([])
}

function accessRequests() {
  return requests.filter((request) =>
    ['transaction_participants', 'transactions'].includes(request.table),
  )
}

function participantRequests() {
  return requests.filter((request) => request.table === 'transaction_participants')
}

function legacyAssignmentRequests() {
  return requests.filter(
    (request) => request.table === 'transactions' && request.url.searchParams.has('assigned_agent_email'),
  )
}

function assertIds(actual, expected, message) {
  assert.deepEqual(new Set(actual), new Set(expected), message)
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { getAccessibleTransactionIdsForUser } = await server.ssrLoadModule('/src/lib/api.js')

  assert.match(
    dashboardSource,
    /organisationId: role === 'agent' \? currentOrganisationId : '',/,
    'the Agent dashboard must continue to pass its active organisation to the access summary',
  )
  assert.match(
    apiSource,
    /const \[participantRowsByUser, participantRowsByEmail, legacyTransactionIds\] = await Promise\.all\(/,
    'the independent Agent identity lookups must run concurrently',
  )

  const scopedIds = await getAccessibleTransactionIdsForUser({
    userId: 'user-1',
    roleType: 'agent',
    organisationId: 'org-a',
  })
  assertIds(
    scopedIds,
    ['tx-user', 'tx-email', 'tx-legacy'],
    'scoped access must retain user, email-only, and legacy email assignments',
  )

  assert.equal(participantRequests().length, 4, 'missing participant columns should use scoped compatibility retries')
  for (const request of participantRequests()) {
    assert.match(
      request.select,
      /transaction:transactions!inner\(organisation_id\)/,
      'each scoped participant query must join its parent transaction',
    )
    assert.equal(
      request.url.searchParams.get('transaction.organisation_id'),
      'eq.org-a',
      'each scoped participant query must be constrained to the active organisation',
    )
  }
  assert.equal(legacyAssignmentRequests().length, 1, 'the legacy email assignment must have one scoped lookup')
  assert.equal(
    legacyAssignmentRequests()[0].url.searchParams.get('organisation_id'),
    'eq.org-a',
    'the legacy email assignment must be constrained to the active organisation',
  )
  assert.equal(
    legacyAssignmentRequests()[0].url.searchParams.get('assigned_agent_email'),
    'eq.agent@example.test',
    'the legacy lookup must preserve email-based assignments',
  )
  assert.equal(
    accessRequests().some((request) => request.url.searchParams.get('organisation_id') === 'eq.org-b'),
    false,
    'Agent access must not query a different organisation',
  )

  requests.length = 0
  participantResponseMode = 'relationship-cache'
  const relationshipFallbackIds = await getAccessibleTransactionIdsForUser({
    userId: 'user-1',
    roleType: 'agent',
    organisationId: 'org-a',
  })
  assertIds(
    relationshipFallbackIds,
    ['tx-user', 'tx-email', 'tx-legacy'],
    'a stale relationship cache must preserve scoped Agent access',
  )
  assert.equal(
    relationshipFallbackIds.includes('tx-foreign'),
    false,
    'the relationship-cache fallback must batch-filter foreign participant rows by organisation',
  )
  const compatibilityFilter = requests.find(
    (request) =>
      request.table === 'transactions' &&
      request.url.searchParams.has('id') &&
      request.url.searchParams.get('organisation_id') === 'eq.org-a',
  )
  assert.ok(compatibilityFilter, 'the relationship-cache fallback must verify candidate IDs against the active organisation')
  assert.match(
    compatibilityFilter.url.searchParams.get('id') || '',
    /in\.\(tx-user,tx-email,tx-foreign\)/,
    'the relationship-cache fallback must batch candidate IDs into one bounded query',
  )

  requests.length = 0
  participantResponseMode = 'missing-columns'
  const compatibilityIds = await getAccessibleTransactionIdsForUser({
    userId: 'user-1',
    roleType: 'agent',
  })
  assertIds(
    compatibilityIds,
    ['tx-user', 'tx-email', 'tx-legacy'],
    'callers without an organisation must retain legacy cross-workspace behaviour',
  )
  for (const request of participantRequests()) {
    assert.equal(
      request.select.includes('transaction:transactions!inner(organisation_id)'),
      false,
      'an unscoped compatibility caller must retain the compact legacy participant projection',
    )
    assert.equal(
      request.url.searchParams.has('transaction.organisation_id'),
      false,
      'an unscoped compatibility caller must not add an organisation relation filter',
    )
  }
  assert.equal(
    legacyAssignmentRequests()[0].url.searchParams.has('organisation_id'),
    false,
    'an unscoped compatibility caller must retain the legacy assignment query shape',
  )

  console.log('agent dashboard Phase 3 query scope tests passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
