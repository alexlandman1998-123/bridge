import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
await db.exec(`create role anon; create role authenticated;
create table transaction_bond_applications(id uuid,transaction_id uuid,bank_name text,status text,submitted_at timestamptz,updated_at timestamptz,notes text);
create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql stable as $$ select $1 = '00000000-0000-0000-0000-000000000001'::uuid $$;
insert into transaction_bond_applications values ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Nedbank','submitted',now(),now(),'Private note'),('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000002','Other bank','submitted',now(),now(),'Other matter');`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261003170000_buyer_portal_bank_applications.sql',import.meta.url),'utf8'))
const result = (await db.query("select bridge_read_buyer_bank_applications('00000000-0000-0000-0000-000000000001') as banks")).rows[0].banks
assert.equal(result.length,1)
assert.equal(result[0].bankName,'Nedbank')
assert.equal('notes' in result[0],false)
for (const id of [null,'00000000-0000-0000-0000-000000000002']) await assert.rejects(db.query('select bridge_read_buyer_bank_applications($1)',[id]),/access denied/i)
await db.close()
console.log('Buyer bank reader checks passed: correct matter, no private notes, denied missing and unrelated token scope.')
