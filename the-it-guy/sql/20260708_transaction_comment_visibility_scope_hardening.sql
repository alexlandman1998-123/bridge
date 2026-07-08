begin;

do $$
declare
  admin_clause text := '';
begin
  if to_regclass('public.transaction_comments') is null then
    raise notice 'Skipping transaction comment visibility hardening because public.transaction_comments does not exist yet.';
    return;
  end if;

  alter table public.transaction_comments add column if not exists unit_id uuid references public.units(id) on delete set null;
  alter table public.transaction_comments add column if not exists development_id uuid references public.developments(id) on delete set null;
  alter table public.transaction_comments add column if not exists organisation_id uuid references public.organisations(id) on delete set null;
  alter table public.transaction_comments add column if not exists author_user_id uuid references public.profiles(id) on delete set null;
  alter table public.transaction_comments add column if not exists author_organisation_name text;
  alter table public.transaction_comments add column if not exists visibility_scope text not null default 'shared';
  alter table public.transaction_comments add column if not exists update_type text not null default 'operational';
  alter table public.transaction_comments add column if not exists related_entity_type text;
  alter table public.transaction_comments add column if not exists related_entity_id text;
  alter table public.transaction_comments add column if not exists attachment_ids text[] not null default '{}';
  alter table public.transaction_comments add column if not exists is_system_generated boolean not null default false;
  alter table public.transaction_comments add column if not exists updated_at timestamptz not null default now();

  update public.transaction_comments
  set visibility_scope = case
    when lower(coalesce(visibility_scope, '')) in ('internal', 'internal_only') then 'internal'
    when lower(coalesce(visibility_scope, '')) in ('client', 'client_visible', 'client_safe', 'buyer_visible') then 'client_safe'
    when comment_text ~* '^[[:space:]]*(\[[a-z_ ]+\][[:space:]]*){0,3}\[(client|client_visible|client_safe|buyer_visible)\]' then 'client_safe'
    when comment_text ~* '^[[:space:]]*(\[[a-z_ ]+\][[:space:]]*){0,3}\[(internal|internal_only)\]' then 'internal'
    else 'shared'
  end;

  alter table public.transaction_comments drop constraint if exists transaction_comments_visibility_scope_check;
  alter table public.transaction_comments
    add constraint transaction_comments_visibility_scope_check
    check (visibility_scope in ('shared', 'internal', 'client_safe'));

  create index if not exists transaction_comments_visibility_scope_idx
    on public.transaction_comments (transaction_id, visibility_scope, created_at desc);
end;
$$;

do $$
begin
  if to_regclass('public.transaction_comments') is null then
    return;
  end if;

  if (
    to_regprocedure('public.bridge_has_transaction_access(uuid)') is not null
    and to_regprocedure('public.bridge_current_profile_role()') is not null
    and to_regprocedure('public.bridge_is_internal_user()') is not null
  ) then
    execute 'drop policy if exists transaction_comments_select_scoped on public.transaction_comments';
    execute $policy$
      create policy transaction_comments_select_scoped on public.transaction_comments
      for select to authenticated
      using (
        public.bridge_has_transaction_access(transaction_id)
        and (
          visibility_scope = 'client_safe'
          or (
            visibility_scope = 'shared'
            and coalesce(public.bridge_current_profile_role(), '') <> 'client'
          )
          or public.bridge_is_internal_user()
        )
      )
    $policy$;
  end if;

  if (
    to_regprocedure('public.bridge_has_transaction_access(uuid)') is not null
    and to_regprocedure('public.bridge_current_profile_role()') is not null
    and to_regprocedure('public.bridge_is_internal_user()') is not null
  ) then
    if to_regprocedure('public.bridge_is_admin()') is not null then
      admin_clause := ' or public.bridge_is_admin()';
    end if;

    execute 'drop policy if exists transaction_comments_insert_scoped on public.transaction_comments';
    execute format($policy$
      create policy transaction_comments_insert_scoped on public.transaction_comments
      for insert to authenticated
      with check (
        public.bridge_has_transaction_access(transaction_id)
        and (
          (
            public.bridge_current_profile_role() = 'client'
            and visibility_scope = 'client_safe'
          )
          or public.bridge_is_internal_user()
          %s
        )
      )
    $policy$, admin_clause);
  end if;
end;
$$;

commit;
