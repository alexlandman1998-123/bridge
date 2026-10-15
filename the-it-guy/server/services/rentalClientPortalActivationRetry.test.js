import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalJourneyAcceptanceDatabase, actor, property, landlordUser, tenantUser } from '../tests/fixtures/rentalJourneyAcceptanceDatabase.js'
let fixture, invitation, membershipId
const call = async (client, name, args) => { const result = await client.rpc(name, args); if (result.error) throw result.error; return result.data }
const invite = () => call(fixture.agent, 'rental_client_portal_create_invitation', { p_audience: 'landlord', p_email: 'owner@example.test', p_property_id: property })
const accept = token => call(fixture.clientForUser(landlordUser), 'rental_client_portal_accept_invitation', { p_token: token })
beforeAll(async () => { fixture = await rentalJourneyAcceptanceDatabase(); invitation = await invite() }, 30000)
afterAll(async () => { await fixture?.db.close() })

it('binds activation to the invited signed-in email and denies anonymous acceptance', async () => {
  await expect(call(fixture.clientForUser(tenantUser), 'rental_client_portal_accept_invitation', { p_token: invitation.token })).rejects.toThrow(/different email/)
  await fixture.db.exec('set role anon')
  try { await expect(fixture.db.query('select rental_client_portal_accept_invitation($1)', [invitation.token])).rejects.toThrow(/permission/) }
  finally { await fixture.db.exec('reset role') }
  expect((await fixture.db.query('select count(*)::int total from rental_client_portal_memberships')).rows[0].total).toBe(0)
})

it('accepts concurrent retries once and acknowledges an existing membership without rewriting its evidence', async () => {
  const [first, retry] = await Promise.all([accept(invitation.token), accept(invitation.token)])
  membershipId = first.membership_id
  expect(retry.membership_id).toBe(membershipId)
  expect([first.idempotent, retry.idempotent].sort()).toEqual([false, true])
  const before = (await fixture.db.query('select * from rental_client_portal_memberships where id=$1', [membershipId])).rows[0]
  const accepted = (await fixture.db.query('select accepted_at,accepted_by from rental_client_portal_invitations where id=$1', [invitation.invitation_id])).rows[0]
  expect((await accept(invitation.token)).idempotent).toBe(true)
  expect((await fixture.db.query('select * from rental_client_portal_memberships where id=$1', [membershipId])).rows[0]).toEqual(before)
  expect((await fixture.db.query('select accepted_at,accepted_by from rental_client_portal_invitations where id=$1', [invitation.invitation_id])).rows[0]).toEqual(accepted)
  expect((await fixture.db.query('select count(*)::int total from rental_client_portal_memberships')).rows[0].total).toBe(1)
})

it('recovers a response lost after acceptance and never reactivates a revoked membership from the old token', async () => {
  invitation = await invite()
  const client = fixture.clientForUser(landlordUser), original = client.rpc
  client.rpc = async (...args) => { const result = await original(...args); return result.error ? result : { error: new Error('Fixture response lost after commit') } }
  await expect(call(client, 'rental_client_portal_accept_invitation', { p_token: invitation.token })).rejects.toThrow('response lost')
  expect((await accept(invitation.token)).membership_id).toBe(membershipId)
  await call(fixture.agent, 'rental_client_portal_revoke_membership', { p_membership_id: membershipId })
  await expect(accept(invitation.token)).rejects.toThrow('no longer has active access')
  expect((await fixture.db.query('select status from rental_client_portal_memberships where id=$1', [membershipId])).rows[0].status).toBe('revoked')
})

it('requires a new invitation to restore access and keeps the earlier acceptance token retired', async () => {
  const fresh = await invite(), accepted = await accept(fresh.token)
  expect(accepted.membership_id).toBe(membershipId); expect(accepted.idempotent).toBe(false)
  expect((await accept(fresh.token)).idempotent).toBe(true)
  await expect(accept(invitation.token)).rejects.toThrow('no longer has active access')
  invitation = fresh
})

it('denies expired and revoked invitations even when their membership remains active', async () => {
  await fixture.db.query("update rental_client_portal_invitations set expires_at='2000-01-01' where id=$1", [invitation.invitation_id])
  await expect(accept(invitation.token)).rejects.toThrow(/invalid, expired/)
  await fixture.db.query("update rental_client_portal_invitations set expires_at='2099-01-01',revoked_at=now() where id=$1", [invitation.invitation_id])
  await expect(accept(invitation.token)).rejects.toThrow(/invalid, expired/)
  expect((await fixture.db.query('select status from rental_client_portal_memberships where id=$1', [membershipId])).rows[0].status).toBe('active')
})

it('keeps the legacy privileged acceptance helper unavailable to browser callers', async () => {
  await fixture.db.transaction(async tx => {
    await tx.query("select set_config('test.actor',$1,true)", [actor]); await tx.exec('set local role authenticated')
    await expect(tx.query('select rental_private.accept_client_invitation_before_retry($1)', [invitation.token])).rejects.toThrow(/permission/)
  })
})
