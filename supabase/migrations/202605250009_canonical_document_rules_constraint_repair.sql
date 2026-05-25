begin;

do $$
begin
  if to_regclass('public.document_requirement_rules') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.document_requirement_rules'::regclass
        and conname = 'document_requirement_rules_requirement_level_check'
    ) then
      alter table public.document_requirement_rules
        add constraint document_requirement_rules_requirement_level_check check (
          requirement_level is null
          or requirement_level in ('blocker', 'required', 'recommended', 'optional', 'not_applicable')
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.document_requirement_rules'::regclass
        and conname = 'document_requirement_rules_effective_window_check'
    ) then
      alter table public.document_requirement_rules
        add constraint document_requirement_rules_effective_window_check check (
          effective_to is null or effective_from is null or effective_to > effective_from
        );
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.document_requirement_rules'::regclass
        and conname = 'document_requirement_rules_active_columns_check'
    ) then
      alter table public.document_requirement_rules
        add constraint document_requirement_rules_active_columns_check check (
          is_active is not true
          or (
            document_definition_key is not null
            and pack_key is not null
            and context_type is not null
          )
        );
    end if;

    if to_regclass('public.document_definitions') is not null
       and not exists (
         select 1
         from pg_constraint
         where conrelid = 'public.document_requirement_rules'::regclass
           and conname = 'document_requirement_rules_document_definition_key_fkey'
       )
    then
      alter table public.document_requirement_rules
        add constraint document_requirement_rules_document_definition_key_fkey
        foreign key (document_definition_key)
        references public.document_definitions(key)
        on update cascade
        on delete cascade;
    end if;

    if to_regclass('public.document_packs') is not null
       and not exists (
         select 1
         from pg_constraint
         where conrelid = 'public.document_requirement_rules'::regclass
           and conname = 'document_requirement_rules_pack_key_fkey'
       )
    then
      alter table public.document_requirement_rules
        add constraint document_requirement_rules_pack_key_fkey
        foreign key (pack_key)
        references public.document_packs(key)
        on update cascade
        on delete restrict;
    end if;
  end if;
end $$;

comment on table public.document_requirement_rules is
  'Canonical conditional document requirement rules used by the resolver. Legacy columns may remain for compatibility; active canonical rows are constrained to definition, pack and context keys.';

notify pgrst, 'reload schema';

commit;
