alter table if exists public.bond_banks
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists next_review_date date,
  add column if not exists relationship_notes text;
