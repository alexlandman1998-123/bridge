import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export async function createTransactionDetailReviewFixture({ fundingReview = true, fundingValidation = true } = {}) {
  const db = new PGlite(),
    tx = randomUUID(),
    other = randomUUID(),
    org = randomUUID(),
    user = randomUUID(),
    viewer = randomUUID(),
    buyer = randomUUID(),
    party = randomUUID(),
    pdf = randomUUID(),
    wrong = randomUUID(),
    lost = randomUUID();
  await db.exec(`
create role anon;create role authenticated;create schema auth;create schema storage;
create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table transactions(id uuid primary key,organisation_id uuid,buyer_id uuid,primary_buyer_participant_id uuid,buyer_name text,purchaser_type text,seller_name text,seller_email text,seller_phone text,seller_type text,property_address_line_1 text,property_address_line_2 text,suburb text,city text,province text,postal_code text,property_description text,development_id uuid,unit_id uuid,attorney text,assigned_attorney_email text,updated_at timestamptz,transaction_reference text,comment text,transaction_origin_source text,sale_date date,stage text,purchase_price numeric,sales_price numeric,deposit_amount numeric,finance_type text,cash_amount numeric,bond_amount numeric,finance_managed_by text,bank text);
create table transaction_participants(id uuid primary key,transaction_id uuid,transaction_role text,removed_at timestamptz,is_primary_buyer boolean,buyer_party_id uuid,participant_name text,participant_email text,participant_phone text,updated_at timestamptz);
create table buyers(id uuid primary key,name text,email text,phone text);create table profiles(id uuid primary key,full_name text);create table organisation_users(organisation_id uuid,user_id uuid,role text,status text);
create table documents(id uuid primary key,transaction_id uuid,file_name text,name text,file_path text,file_bucket text,created_at timestamptz default now());create table storage.objects(bucket_id text,name text,updated_at timestamptz default now());
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select false$$;
create function bridge_can_access_transaction_org_member(uuid) returns boolean language sql security definer as $$select exists(select 1 from public.transactions t join public.organisation_users m on m.organisation_id=t.organisation_id where t.id=$1 and m.user_id=auth.uid() and m.status='active')$$;
create function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select false$$;
insert into auth.users values('${user}'),('${viewer}');insert into profiles values('${user}','Reviewer One');insert into organisation_users values('${org}','${user}','agent','active'),('${org}','${viewer}','viewer','active');
insert into buyers values('${buyer}','Shared profile','old@example.com','123');
insert into transactions(id,organisation_id,buyer_id,primary_buyer_participant_id,buyer_name,purchaser_type,seller_name,property_address_line_1,attorney,assigned_attorney_email,sale_date,stage) values('${tx}','${org}','${buyer}','${party}','Captured name','individual','Seller','123 Main Road','Appointed firm','appointed@example.com','2024-04-03','Transfer');insert into transactions(id) values('${other}');
insert into transaction_participants(id,transaction_id,transaction_role,is_primary_buyer,buyer_party_id,participant_name) values('${party}','${tx}','buyer',true,'${buyer}','Scanned name');
insert into documents(id,transaction_id,file_name,file_path,file_bucket) values('${pdf}','${tx}','otp.pdf','otp.pdf','documents'),('${wrong}','${other}','other.pdf','other.pdf','documents'),('${lost}','${tx}','lost.pdf','lost.pdf','documents');insert into storage.objects(bucket_id,name) values('documents','otp.pdf'),('documents','other.pdf');
`);
  await db.exec(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261001185738_imported_transaction_detail_review.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../../supabase/migrations/20261001191425_imported_transaction_review_status.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (fundingReview) await db.exec(readFileSync(new URL('../../../supabase/migrations/20261001195834_imported_transaction_funding_review.sql', import.meta.url), 'utf8'));
  if (fundingReview && fundingValidation) await db.exec(readFileSync(new URL('../../../supabase/migrations/20261001201355_imported_transaction_funding_validation.sql', import.meta.url), 'utf8'));
  const ordinary = randomUUID(),
    candidate = randomUUID(),
    future = randomUUID();
  await db.query(
    "update transactions set transaction_reference=$1,comment=$2 where id=$3",
    [
      "PR-OTP-IMP-R09",
      "Internal import draft from Produktive_OTP_Transaction_Import.xlsx row 9. Source PDF: otp.pdf. Workbook status: Review required.",
      tx,
    ],
  );
  await db.query(
    "update transactions set transaction_origin_source=$1 where id=$2",
    ["bulk_import", other],
  );
  await db.query(
    "insert into transactions(id,organisation_id,sale_date) values($1,$2,$3)",
    [ordinary, org, "2020-01-01"],
  );
  await db.query(
    "insert into transactions(id,organisation_id,transaction_reference) values($1,$2,$3)",
    [candidate, org, "PR-OTP-IMP-R07"],
  );
  await db.query(
    "insert into transactions(id,organisation_id,transaction_origin_source) values($1,$2,$3)",
    [future, org, "bulk_upload"],
  );
  return {
    db,
    tx,
    other,
    org,
    user,
    viewer,
    buyer,
    party,
    pdf,
    wrong,
    lost,
    ordinary,
    candidate,
    future,
  };
}
