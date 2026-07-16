-- Read-only P6 deployment verification. Replace UUIDs before running.
select contract_version, mode, kill_switch_enabled, allowed_adapters, allowed_capabilities, failure_threshold, cooldown_seconds, timeout_ms, revision, created_at
from public.conveyancer_provider_runtime_controls
where organisation_id = '00000000-0000-0000-0000-000000000000'::uuid and attorney_firm_id = '00000000-0000-0000-0000-000000000000'::uuid
order by revision desc limit 5;

select provider_key, adapter_key, profile_status, secret_reference, source_phase, revision, created_at
from public.conveyancer_integration_profiles
where organisation_id = '00000000-0000-0000-0000-000000000000'::uuid and attorney_firm_id = '00000000-0000-0000-0000-000000000000'::uuid and source_phase = 'P6'
order by created_at desc;

select provider_key, adapter_key, outcome, circuit_state, consecutive_failures, error_code, duration_ms, occurred_at
from public.conveyancer_provider_health_events
where organisation_id = '00000000-0000-0000-0000-000000000000'::uuid and attorney_firm_id = '00000000-0000-0000-0000-000000000000'::uuid
order by occurred_at desc limit 100;
