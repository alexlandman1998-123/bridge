begin;
-- Reconciliation runs as invoker; only the server operator may inspect catalogue.
grant usage on schema journey_private to service_role;
grant select on journey_private.task_catalog to service_role;
commit;
