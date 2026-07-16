import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createAttorneyQuotePublicLink,
  revokeAttorneyQuotePublicLink,
} from '../src/services/attorneyLeadsService.js'
import {
  decideAttorneyPublicQuote,
  normalizeAttorneyPublicQuote,
  resolveAttorneyPublicQuote,
} from '../src/services/attorneyQuotePublicService.js'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160011_attorney_quote_public_decision_phase12.sql', import.meta.url), 'utf8')
const edge = await readFile(new URL('../../supabase/functions/attorney-quote-decision/index.ts', import.meta.url), 'utf8')
const config = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
const app = await readFile(new URL('src/App.jsx', root), 'utf8')
const leadsPage = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const publicPage = await readFile(new URL('src/pages/AttorneyQuoteDecisionPage.jsx', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-12-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    return Promise.resolve(fn()).then(() => console.log(`ok - ${name}`))
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('public quote links are tenant-consistent children of both Lead and quote', () => {
  assert.match(migration, /create table if not exists public\.attorney_lead_quote_public_links/)
  assert.match(migration, /foreign key \(lead_id, organisation_id\)[\s\S]*references public\.leads\(lead_id, organisation_id\)/)
  assert.match(migration, /foreign key \(quote_id, organisation_id, lead_id\)[\s\S]*references public\.attorney_lead_quotes\(id, organisation_id, lead_id\)/)
  assert.match(migration, /attorney_quote_public_links_one_active_idx[\s\S]*where status = 'active'/)
})

await test('raw bearer tokens are returned once and only SHA-256 hashes persist', () => {
  assert.match(migration, /v_token := encode\(gen_random_bytes\(32\), 'hex'\)/)
  assert.match(migration, /encode\(digest\(v_token, 'sha256'\), 'hex'\)/)
  assert.match(migration, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(migration, /'token', v_token/)
  assert.doesNotMatch(migration, /\btoken text not null\b/)
})

await test('authenticated staff can only read metadata and mutate through bounded commands', () => {
  assert.match(migration, /alter table public\.attorney_lead_quote_public_links enable row level security/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'view'/)
  assert.match(migration, /revoke all on table public\.attorney_lead_quote_public_links from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.attorney_lead_quote_public_links to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.attorney_lead_quote_public_links to authenticated/i)
  assert.match(migration, /Only open unconverted Attorney Leads can share quotes/)
  assert.match(migration, /Only a sent Attorney Lead quote can be shared/)
})

await test('public resolver and decision commands are service-role only', () => {
  assert.match(migration, /if auth\.role\(\) <> 'service_role' then raise exception 'Service role required'/)
  assert.match(migration, /revoke all on function public\.resolve_attorney_quote_public_link\(text\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.resolve_attorney_quote_public_link\(text\) to service_role/)
  assert.match(migration, /grant execute on function public\.decide_attorney_quote_public_link\(text, text, text\) to service_role/)
})

await test('decision flow is expiring, revocable, idempotent, and parent-first locked', () => {
  assert.match(migration, /status in \('active', 'used', 'revoked'\)/)
  assert.match(migration, /v_link\.expires_at <= v_now/)
  assert.match(migration, /v_link\.status = 'used' and v_quote\.status = v_decision/)
  assert.match(migration, /A decline reason is required/)
  const decision = migration.slice(migration.indexOf('create or replace function public.decide_attorney_quote_public_link'))
  const leadLock = decision.indexOf('select lead.* into v_lead')
  const linkLock = decision.indexOf('select link.* into v_link')
  const quoteLock = decision.indexOf('select quote.* into v_quote')
  assert.ok(leadLock >= 0 && linkLock > leadLock && quoteLock > linkLock)
  assert.match(decision.slice(leadLock, linkLock), /for update/)
  assert.match(decision.slice(linkLock, quoteLock), /for update/)
  assert.match(decision.slice(quoteLock), /for update/)
})

await test('every internal terminal quote transition invalidates its active public link', () => {
  assert.match(migration, /bridge_revoke_quote_links_on_terminal_state/)
  assert.match(migration, /old\.status = 'sent' and new\.status <> 'sent'/)
  assert.match(migration, /set status = 'revoked', revoked_at = now\(\)[\s\S]*status = 'active'/)
  assert.match(migration, /after update of status on public\.attorney_lead_quotes/)
  assert.match(migration, /set status = 'used', used_at = v_now, revoked_at = null/)
})

await test('public decisions preserve the Lead and Matter boundary', () => {
  assert.match(migration, /set stage = 'won', status = 'won'/)
  assert.match(migration, /Quote Accepted Publicly/)
  assert.match(migration, /Quote Declined Publicly/)
  assert.doesNotMatch(migration, /insert into public\.(transactions|transaction_attorney_assignments|attorney_instruction_responses)/i)
  assert.match(notes, /never creates a Matter, transaction, assignment, or Incoming Instruction/)
})

await test('Edge boundary is anonymous, bounded, no-store, and service mediated', () => {
  assert.match(config, /\[functions\.attorney-quote-decision\][\s\S]*verify_jwt = false/)
  assert.match(edge, /MAX|8192/)
  assert.match(edge, /Cache-Control": "no-store, max-age=0"/)
  assert.match(edge, /X-Frame-Options": "DENY"/)
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(edge, /resolve_attorney_quote_public_link/)
  assert.match(edge, /decide_attorney_quote_public_link/)
  assert.doesNotMatch(edge, /\.from\("(?:leads|attorney_lead_quotes|attorney_lead_quote_public_links)"\)/)
})

await test('public payload exposes presentation and quote values but no internal identifiers', () => {
  assert.match(migration, /'firm_name', firm\.name/)
  assert.match(migration, /'quote_number', quote\.quote_number/)
  assert.match(migration, /'total_amount', quote\.total_amount/)
  const resolver = migration.slice(migration.indexOf('create or replace function public.resolve_attorney_quote_public_link'), migration.indexOf('create or replace function public.decide_attorney_quote_public_link'))
  assert.doesNotMatch(resolver, /'organisation_id'|'lead_id'|'quote_id'|'contact_id'/)
  assert.doesNotMatch(resolver, /internal_note/)
})

await test('staff service issues and revokes links through dedicated RPCs', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push({ name, args })
    return name === 'bridge_create_attorney_quote_public_link'
      ? { data: { success: true, link_id: 'link-1', quote_id: 'quote-1', token: 'a'.repeat(64), expires_at: '2026-07-31T00:00:00Z' }, error: null }
      : { data: { success: true, link_id: 'link-1' }, error: null }
  } }
  const created = await createAttorneyQuotePublicLink({ organisationId: 'org-1', quoteId: 'quote-1', client })
  await revokeAttorneyQuotePublicLink({ organisationId: 'org-1', linkId: created.linkId, client })
  assert.equal(created.token.length, 64)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_create_attorney_quote_public_link', 'bridge_revoke_attorney_quote_public_link'])
})

await test('public service normalizes presentation values and rejects malformed commands locally', async () => {
  const quote = normalizeAttorneyPublicQuote({ state: 'active', firm_name: 'Young Law', primary_colour: 'not-css', quote_number: 'AQ-2026-000001', total_amount: '1150.00' })
  assert.equal(quote.firmName, 'Young Law')
  assert.equal(quote.primaryColour, '#173f45')
  assert.equal(quote.totalAmount, 1150)
  await assert.rejects(resolveAttorneyPublicQuote('bad-token'), /unavailable/)
  await assert.rejects(decideAttorneyPublicQuote({ token: 'a'.repeat(64), decision: 'declined' }), /reason/)
})

await test('staff and client interfaces expose deliberate sharing and decision states', () => {
  assert.match(leadsPage, /Create client link/)
  assert.match(leadsPage, /Reissue client link/)
  assert.match(leadsPage, /Revoke link/)
  assert.match(app, /path="\/quote\/:token"/)
  assert.match(publicPage, /Accept quote/)
  assert.match(publicPage, /Decline quote/)
  assert.match(publicPage, /does not itself open a legal Matter or create an attorney-client mandate/)
})

console.log('Attorney quote public decision Phase 12 tests passed')
