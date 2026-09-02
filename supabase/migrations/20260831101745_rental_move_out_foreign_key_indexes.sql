create index if not exists rental_move_out_workflows_organisation_id_idx on public.rental_move_out_workflows (organisation_id);
create index if not exists rental_move_out_workflows_notice_id_idx on public.rental_move_out_workflows (notice_id);
create index if not exists rental_move_out_workflows_created_by_idx on public.rental_move_out_workflows (created_by);
create index if not exists rental_move_out_checklist_items_completed_by_idx on public.rental_move_out_checklist_items (completed_by);
