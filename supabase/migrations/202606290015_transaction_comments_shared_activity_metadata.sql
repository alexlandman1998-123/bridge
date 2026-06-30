alter table if exists public.transaction_comments
  add column if not exists unit_id uuid references public.units(id) on delete set null,
  add column if not exists development_id uuid references public.developments(id) on delete set null,
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists author_user_id uuid references auth.users(id) on delete set null,
  add column if not exists author_organisation_name text,
  add column if not exists visibility_scope text not null default 'shared_transaction',
  add column if not exists update_type text not null default 'operational',
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists attachment_ids uuid[] not null default '{}',
  add column if not exists is_system_generated boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists transaction_comments_unit_id_idx
  on public.transaction_comments(unit_id);

create index if not exists transaction_comments_development_id_idx
  on public.transaction_comments(development_id);

create index if not exists transaction_comments_organisation_id_idx
  on public.transaction_comments(organisation_id);

create index if not exists transaction_comments_visibility_scope_idx
  on public.transaction_comments(visibility_scope);

create index if not exists transaction_comments_update_type_idx
  on public.transaction_comments(update_type);
