alter table if exists public.document_requests
  add column if not exists request_type text not null default 'additional_document_request';

alter table if exists public.document_requests
  add column if not exists requested_from text not null default 'buyer';

alter table if exists public.document_requests
  add column if not exists visibility_scope text not null default 'shared_role_players';

alter table if exists public.document_requests
  add column if not exists notes text;

update public.document_requests
set
  request_type = coalesce(nullif(trim(request_type), ''), 'additional_document_request'),
  requested_from = coalesce(nullif(trim(requested_from), ''), 'buyer'),
  visibility_scope = coalesce(nullif(trim(visibility_scope), ''), 'shared_role_players')
where
  request_type is null
  or requested_from is null
  or visibility_scope is null;

alter table if exists public.document_requests drop constraint if exists document_requests_priority_check;
alter table if exists public.document_requests
  add constraint document_requests_priority_check
  check (priority in ('required', 'important', 'optional', 'normal', 'urgent'));

alter table if exists public.document_requests drop constraint if exists document_requests_status_check;
alter table if exists public.document_requests
  add constraint document_requests_status_check
  check (status in ('requested', 'uploaded', 'under_review', 'reviewed', 'rejected', 'completed', 'cancelled'));

alter table if exists public.document_requests drop constraint if exists document_requests_requested_from_check;
alter table if exists public.document_requests
  add constraint document_requests_requested_from_check
  check (requested_from in ('buyer', 'seller', 'buyer_and_seller', 'agent', 'developer', 'attorney', 'bond_originator', 'other'));

alter table if exists public.document_requests drop constraint if exists document_requests_visibility_scope_check;
alter table if exists public.document_requests
  add constraint document_requests_visibility_scope_check
  check (visibility_scope in ('client_visible', 'internal_only', 'shared_role_players'));

create index if not exists document_requests_request_type_idx on public.document_requests (request_type);
create index if not exists document_requests_visibility_scope_idx on public.document_requests (visibility_scope);
create index if not exists document_requests_requested_from_idx on public.document_requests (requested_from);
