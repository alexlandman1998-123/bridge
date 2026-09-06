begin;

-- Hosted projects can grant service_role broad table privileges through default
-- privileges at CREATE TABLE time. Reset the two append-only/control tables to
-- the narrower Phase 6/7 contract after they already exist.
revoke all on table public.website_publication_events from service_role;
grant select, insert on table public.website_publication_events to service_role;

revoke all on table public.website_pilot_enrolments from service_role;
grant select, insert, update on table public.website_pilot_enrolments to service_role;

notify pgrst, 'reload schema';

commit;
