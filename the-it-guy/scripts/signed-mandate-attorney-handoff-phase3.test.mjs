import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const migration = await readFile(resolve(root, '../supabase/migrations/20260918210000_signed_mandate_attorney_handoff_phase3.sql'), 'utf8')
const listingDetail = await readFile(resolve(root, 'src/pages/AgentListingDetail.jsx'), 'utf8')

// No attorney in the frozen pack is a successful no-op, rather than a fallback
// to mutable onboarding data or an invented partner.
assert.match(migration, /no_proposed_transfer_attorney/)
assert.match(migration, /v_session\.signing_pack_snapshot -> 'proposedTransferAttorney'/)

// A chosen attorney is resolved from the canonical role configuration frozen
// into the pack, then becomes the pre-instruction allocation consumed by the
// existing incoming-matters pipeline.
assert.match(migration, /partnerRoleConfigurationId/)
assert.match(listingDetail, /proposedTransferAttorney: proposedTransferAttorney \? \{[\s\S]*partnerRoleConfigurationId: proposedTransferAttorney\.partnerRoleConfigurationId/)
assert.match(migration, /role_type = 'transfer_attorney'/)
assert.match(migration, /allocation_status, mandate_packet_id, mandate_signed_at, metadata/)
assert.match(migration, /'awaiting_buyer'/)
assert.match(migration, /signed_mandate_attorney_handoff_phase3/)

// Replaying the same signed session updates the one active allocation instead
// of creating another one.
assert.match(migration, /for update;[\s\S]*v_existing\.partner_role_configuration_id = v_role_config\.id/)
assert.match(migration, /idempotentReplay/)

// A configuration from another agency (or an inactive/unbound one) cannot be
// allocated, even if its UUID appeared in the frozen payload.
assert.match(migration, /organisation_id = v_listing\.organisation_id/)
assert.match(migration, /and is_active = true/)
assert.match(migration, /not an active partner of this listing agency/)

// The trigger runs only after a mandate session has become signed and waits for
// every member of a multi-signer group before handing the matter to the firm.
assert.match(migration, /after update of status/)
assert.match(migration, /new\.status = 'signed'/)
assert.match(migration, /new\.selected_documents, '\[\]'::jsonb\) \? 'mandate'/)
assert.match(migration, /sibling\.status <> 'signed'/)
assert.match(migration, /grant execute on function public\.bridge_handoff_signed_mandate_transfer_attorney\(uuid\) to service_role/)

console.log('Signed-mandate attorney handoff Phase 3 checks passed.')
