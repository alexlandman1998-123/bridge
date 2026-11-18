import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEmailCampaignDatabase } from './fixtures/emailCampaignDatabase.mjs'

const { db, one, org, other, asService, asUser } = await createEmailCampaignDatabase()
let checks = 0
const check = (value, expected = true) => { assert.deepEqual(value, expected); checks++ }
try {
  await db.exec('reset role')
  const roles = readFileSync('supabase/migrations/202607170027_settings_role_permission_governance_phase3_2.sql', 'utf8')
  await db.exec(roles.slice(roles.indexOf('create or replace function'), roles.indexOf('$$;') + 3))
  await db.exec(`create function bridge_membership_role(uuid) returns text language sql as $$ select current_setting('test.membership_role',true) $$;
    set test.membership_role='principal';
    -- Reproduce the older permissive policy and table grants seen in production.
    grant all on email_sender_identities,email_sending_domains to authenticated;
    create policy legacy_member_all on email_sender_identities for all to authenticated using(bridge_has_organisation_membership(organisation_id)) with check(bridge_has_organisation_membership(organisation_id));`)
  await db.exec(readFileSync('supabase/migrations/20261118082259_email_domain_setup_permissions.sql', 'utf8'))
  await asUser()
  check((await one('select email_domain_can_manage($1) ok', [org])).ok)
  check((await one('select email_domain_can_manage($1) ok', [other])).ok, false)
  for (const role of ['agent','branch_manager','admin','hq_manager','director','partner']) {
    await db.query("select set_config('test.membership_role',$1,false)", [role])
    check((await one('select email_domain_can_manage($1) ok', [org])).ok, false)
  }
  for (const role of ['owner','super_admin','principal']) {
    await db.query("select set_config('test.membership_role',$1,false)", [role])
    check((await one('select email_domain_can_manage($1) ok', [org])).ok)
  }
  const status = async () => (await one('select email_domain_setup_status($1) s', [org])).s
  check((await status()).account_blocker, 'activation')
  check((await status()).account_ready, false)
  for (const table of ['email_sending_domains', 'email_sender_identities']) {
    for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) check((await one('select has_table_privilege(\'authenticated\',$1,$2) ok', [table, privilege])).ok, false)
  }
  await asService()
  const domain = await one("insert into email_sending_domains(organisation_id,domain_name,provider_domain_id) values($1,'updates.agency.co.za','qa-provider') returning *", [org])
  await db.query("select email_apply_domain_status($1,'verified','[]')", [domain.id])
  await asUser()
  const sender = await one("select * from email_save_sender($1,$2,'Agency','news@updates.agency.co.za','office@agency.co.za')", [org, domain.id])
  check(sender.verification_status, 'verified')
  check((await status()).account_blocker, 'activation') // Domain proof must not enable account sending.
  await db.exec("set test.membership_role='agent'")
  check((await one('select email_domain_can_manage($1) ok', [org])).ok, false)
  check((await one('select count(*)::integer n from email_sending_domains')).n, 0)
  check((await one('select count(*)::integer n from email_sender_identities')).n, 0)
  await assert.rejects(status(), /Principal access/); checks++
  await assert.rejects(db.query("select email_save_sender($1,$2,'Agent','bad@updates.agency.co.za','office@agency.co.za')", [org,domain.id]), /principal/); checks++
  await assert.rejects(db.query("select email_save_platform_sender($1,'Agent','office@agency.co.za')", [org]), /principal/); checks++
  await assert.rejects(db.query('delete from email_sender_identities where id=$1', [sender.id]), /permission denied/); checks++
  await db.exec("set test.membership_role='branch_manager'")
  check((await one('select email_domain_can_manage($1) ok', [org])).ok, false)
  await db.exec("set test.membership_role='principal'")
  check((await one('select count(*)::integer n from email_sender_identities')).n, 1)
  await asUser(other)
  check((await one('select count(*)::integer n from email_sender_identities')).n, 0)
  await asService()
  await db.exec('update email_campaign_account_limits set enabled=true,daily_limit=50,monthly_limit=500')
  await asUser()
  check((await status()).account_ready)
  check((await status()).account_blocker, null)
  check(Boolean((await status()).approved_at))
  await asService()
  await db.query("select email_apply_domain_status($1,'failed','[]')", [domain.id])
  check((await one('select verification_status from email_sender_identities where id=$1', [sender.id])).verification_status, 'failed')
  await asUser()
  await db.exec("set request.jwt.claim.sub=''")
  check((await one('select email_domain_can_manage($1) ok', [org])).ok, false)
  await assert.rejects(status(), /Principal access/); checks++
  await db.exec('reset role; set role anon')
  await assert.rejects(status(), /permission denied/); checks++
  console.log(`Domain setup database: ${checks} checks passed; principal/agent/branch/anonymous and tenant boundaries, destructive grants, activation and domain loss. No remote calls.`)
} finally { await db.close() }
