import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite(),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0]
try{
 await db.exec(`create schema handoff_private;create role anon;create role authenticated;create role service_role;
 create table transactions(id uuid,lifecycle_state text,registered_at timestamptz,cancelled_at timestamptz,archived_at timestamptz);
 create table transaction_partner_invitations(id uuid,transaction_id uuid,role_type text,status text,organisation_id uuid,accepted_user_id uuid,accepted_at timestamptz,metadata jsonb);
 create table transaction_legal_role_appointments(id uuid,transaction_id uuid,role_type text,evidence_confirmed boolean,accepted_organisation_id uuid,accepted_firm_id uuid,accepted_at timestamptz,coordination_state text);
 create table transaction_attorney_assignments(id uuid,transaction_id uuid,attorney_role text,attorney_firm_id uuid,firm_id uuid,attorney_user_id uuid,primary_attorney_id uuid,assignment_status text,instruction_status text,appointment_source text,firm_acceptance_status text,firm_accepted_at timestamptz,firm_accepted_by uuid,staff_assignment_status text,allocation_state text,allocation_state_changed_at timestamptz,assigned_organisation_id uuid,scope_level text);
 insert into transactions values('${id(1)}','active',null,null,null);
 insert into transaction_partner_invitations values('${id(10)}','${id(1)}','bond_attorney','accepted','${id(20)}','${id(21)}',now(),'{"legal_role_appointment_id":"${id(30)}"}');
 insert into transaction_legal_role_appointments values('${id(30)}','${id(1)}','bond_attorney',true,'${id(20)}','${id(40)}',now(),'invite_accepted');
 insert into transaction_attorney_assignments(id,transaction_id,attorney_role,attorney_firm_id,assignment_status,instruction_status,firm_acceptance_status,staff_assignment_status,allocation_state) values('${id(50)}','${id(1)}','bond_attorney','${id(40)}','pending','new_instruction','not_required','not_required','active');`)
 const source=await readFile(new URL('../../supabase/migrations/20261104120444_bank_firm_acceptance_allocation_state.sql',import.meta.url),'utf8')
 await db.exec(source.slice(0,source.indexOf('CREATE OR REPLACE FUNCTION public.bridge_bind_bank_appointed_firm_acceptance')))
 await db.query('select handoff_private.reconcile_bank_firm_allocation($1)',[id(10)])
 assert.equal(await scalar('select allocation_state from transaction_attorney_assignments'),'awaiting_staff_assignment')
 assert.equal(await scalar('select firm_acceptance_status from transaction_attorney_assignments'),'accepted')
 assert.equal(await scalar('select attorney_user_id from transaction_attorney_assignments'),null)
 assert.equal(await scalar('select instruction_status from transaction_attorney_assignments'),'new_instruction')
 await db.exec(`update transaction_attorney_assignments set attorney_user_id='${id(22)}',allocation_state='staff_assigned',staff_assignment_status='staff_assigned';`)
 await db.query('select handoff_private.reconcile_bank_firm_allocation($1)',[id(10)])
 assert.equal(await scalar('select attorney_user_id from transaction_attorney_assignments'),id(22))
 assert.equal(await scalar('select allocation_state from transaction_attorney_assignments'),'staff_assigned')
 await db.exec("update transaction_attorney_assignments set attorney_user_id=null,allocation_state='active',firm_acceptance_status='not_required';update transactions set lifecycle_state='completed',registered_at=now();")
 await db.query('select handoff_private.reconcile_bank_firm_allocation($1)',[id(10)])
 assert.equal(await scalar('select allocation_state from transaction_attorney_assignments'),'active','Historical closed matters remain unchanged.')
 await db.exec("update transactions set lifecycle_state='active',registered_at=null;update transaction_partner_invitations set status='pending';")
 await db.query('select handoff_private.reconcile_bank_firm_allocation($1)',[id(10)])
 assert.equal(await scalar('select firm_acceptance_status from transaction_attorney_assignments'),'not_required','A pending invitation cannot establish acceptance.')
 console.log('PASS accepted bank firm enters staff allocation without appointing a person or accepting instructions; replays preserve assigned staff, pending invites and closed matters.')
}finally{await db.close()}
