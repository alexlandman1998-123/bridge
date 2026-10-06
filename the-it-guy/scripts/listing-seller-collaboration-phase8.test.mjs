import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../supabase/migrations/20260924160026_listing_seller_collaboration_permissions_phase8.sql', root), 'utf8')
const page = await readFile(new URL('src/pages/SellerCollaborationPortal.jsx', root), 'utf8')
const panel = await readFile(new URL('src/components/listings/ListingSellerCollaborationPanel.jsx', root), 'utf8')

test('seller tables are RLS protected and not directly writable by portal users', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.private_listing_seller_participants from public, anon, authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*private_listing_seller_participants to authenticated/i)
})

test('approval is canonical and conflicts check all concurrent records', () => {
  assert.match(migration, /save_private_listing_seller_canonical_update/)
  assert.match(migration, /v_participant\.record_version <> v_request\.base_participant_version/)
  assert.match(migration, /v_listing\.updated_at is distinct from v_request\.base_listing_updated_at/)
  assert.match(migration, /v_onboarding_updated_at is distinct from v_request\.base_onboarding_updated_at/)
})

test('participant payload is allowlisted and does not return shared onboarding data', () => {
  const payloadFunction = migration.slice(migration.indexOf('bridge_listing_seller_participant_payload'), migration.indexOf('bridge_submit_listing_seller_change'))
  assert.match(payloadFunction, /visibleSections/)
  assert.doesNotMatch(payloadFunction, /to_jsonb\(v_onboarding\)/)
  assert.doesNotMatch(payloadFunction, /seller_canonical_facts_json/)
  assert.match(payloadFunction, /participantId/)
})

test('both seller and agent surfaces expose safe proposal and retry workflows', () => {
  assert.match(page, /Submit for review/)
  assert.match(page, /Other sellers’ identity, financial and compliance/)
  assert.match(page, /information is not included/)
  assert.match(panel, /Approve reviewed values/)
  assert.match(panel, /The failure is recorded and can be retried/)
  assert.match(migration, /bridge_retry_listing_seller_notification/)
  assert.match(migration, /outside your assigned seller access/)
})

// Execute the actual handlers with controlled service responses. A failed save
// must preserve the draft, refresh once and keep the reload guidance visible.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const submitBody = page.match(/async function handleSubmit\(event\) \{([\s\S]*?)\n  \}\n\n  if \(!payload\)/)?.[1]
const loadBody = page.match(/const load = useCallback\(async \(id = participantId, token = accessToken\) => \{([\s\S]*?)\n  \}, \[accessToken, participantId\]\);/)?.[1]
assert.ok(submitBody && loadBody, 'Seller portal handlers must be available to exercise')

for (const code of ['40001', 'PT409']) {
  for (const reloadFails of [false, true]) {
    test(`seller conflict ${code} preserves edits and reports ${reloadFails ? 'refresh failure' : 'reload guidance'}`, async () => {
      const state = { draft: { phone: '0821234567' }, error: '', saves: 0, reads: 0, saving: null, loading: null }
      const setError = value => { state.error = value }
      const load = async () => new AsyncFunction('id', 'token', 'setLoading', 'setError', 'setPayload', 'getListingSellerParticipantPayload', 'localStorage', 'storageKey', 'setAccessToken', loadBody)(
        'participant', 'access-token', value => { state.loading = value }, setError, () => {}, async () => {
          state.reads++
          if (reloadFails) throw new Error('Your secure session expired.')
          return { participant: { recordVersion: 4 } }
        }, { removeItem() {} }, id => id, () => {},
      )
      await new AsyncFunction('event', 'draft', 'text', 'setError', 'setSaving', 'submitListingSellerChange', 'participantId', 'accessToken', 'sensitivity', 'payload', 'setDraft', 'setMessage', 'load', submitBody)(
        { preventDefault() {} }, state.draft, value => String(value ?? '').trim(), setError,
        value => { state.saving = value }, async () => { state.saves++; throw { code } },
        'participant', 'access-token', 'general', { participant: { recordVersion: 3 } },
        value => { state.draft = value }, () => {}, load,
      )
      assert.equal(state.saves, 1)
      assert.equal(state.reads, 1)
      assert.deepEqual(state.draft, { phone: '0821234567' })
      assert.equal(state.saving, false)
      assert.equal(state.loading, false)
      if (reloadFails) assert.equal(state.error, 'Your secure session expired.')
      else assert.match(state.error, /latest record has been loaded; please review and submit again/)
    })
  }

  test(`agent review ${code} refreshes once and keeps conflict feedback`, async () => {
    const reviewBody = panel.match(/async function review\(request, decision\) \{([\s\S]*?)\n  \}\n\n  async function retryNotification/)?.[1]
    assert.ok(reviewBody, 'Agent review handler must be available to exercise')
    let feedback
    let reads = 0
    let saves = 0
    let changes = 0
    let action
    await new AsyncFunction('request', 'decision', 'setAction', 'setFeedback', 'reviewListingSellerChange', 'listing', 'reviewNotes', 'load', 'onChanged', reviewBody)(
      { id: 'request' }, 'approve', value => { action = value }, value => { feedback = value },
      async () => { saves++; throw { code } }, { id: 'listing' }, {},
      async () => { reads++ }, async () => { changes++ },
    )
    assert.equal(saves, 1)
    assert.equal(reads, 1)
    assert.equal(changes, 0)
    assert.equal(action, '')
    assert.equal(feedback.tone, 'error')
    assert.match(feedback.message, /Nothing was overwritten; refresh and review again/)
  })
}
