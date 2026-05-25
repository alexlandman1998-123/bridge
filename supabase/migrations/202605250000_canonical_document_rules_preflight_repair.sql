begin;

create extension if not exists "pgcrypto";

create or replace function public.bridge_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.document_requirement_rules') is not null then
    alter table public.document_requirement_rules
      alter column id set default gen_random_uuid();

    alter table public.document_requirement_rules
      alter column created_at set default now();

    alter table public.document_requirement_rules
      alter column updated_at set default now();

    alter table public.document_requirement_rules
      add column if not exists document_definition_key text,
      add column if not exists pack_key text,
      add column if not exists context_type text,
      add column if not exists condition_json jsonb not null default '{}'::jsonb,
      add column if not exists requirement_level text,
      add column if not exists stage_gates text[] not null default '{}'::text[],
      add column if not exists requested_from_role text,
      add column if not exists visible_to_roles text[],
      add column if not exists uploadable_by_roles text[],
      add column if not exists reviewer_role text,
      add column if not exists priority integer not null default 100,
      add column if not exists resolver_key text,
      add column if not exists is_active boolean not null default false,
      add column if not exists effective_from timestamptz,
      add column if not exists effective_to timestamptz;
  end if;
end $$;

comment on table public.document_requirement_rules is
  'Canonical conditional document requirement rules. This table was additively upgraded from an earlier legacy rule shape where present.';

notify pgrst, 'reload schema';

commit;
