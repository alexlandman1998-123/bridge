begin;

drop policy if exists commercial_landlords_brokerage_access on public.commercial_landlords;

create policy commercial_landlords_brokerage_access on public.commercial_landlords
for all to authenticated
using (
  exists (
    select 1
    from public.bridge_commercial_user_scope(organisation_id) scope
    where scope.scope_level = 'organisation'
      or (
        scope.scope_level = 'branch'
        and (
          branch_id = scope.branch_id
          or branch_id is null
        )
      )
      or (
        scope.scope_level = 'team'
        and (
          team_id = scope.team_id
          or created_by = scope.user_id
        )
      )
      or (
        scope.scope_level = 'broker'
        and (
          broker_id = scope.user_id
          or created_by = scope.user_id
          or (
            broker_id is null
            and (
              branch_id is null
              or branch_id = scope.branch_id
            )
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.bridge_commercial_user_scope(organisation_id) scope
    where scope.scope_level = 'organisation'
      or (
        scope.scope_level = 'branch'
        and (
          branch_id = scope.branch_id
          or branch_id is null
        )
      )
      or (
        scope.scope_level = 'team'
        and (
          team_id = scope.team_id
          or created_by = scope.user_id
        )
      )
      or (
        scope.scope_level = 'broker'
        and (
          broker_id = scope.user_id
          or created_by = scope.user_id
          or (
            broker_id is null
            and (
              branch_id is null
              or branch_id = scope.branch_id
            )
          )
        )
      )
  )
);

commit;
