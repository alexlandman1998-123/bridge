-- Admin portal access recovery (production)
--
-- Purpose: diagnose and, only after an authorised operator has confirmed the
-- account owner should hold executive admin access, restore the secure role
-- token required by admin.arch9.co.za.
--
-- The 2026-09-01 admin authorization migration intentionally ignores profile
-- and organisation roles. It reads only auth.users.raw_app_meta_data.
--
-- Run section 1 first in the Supabase SQL editor using a production admin
-- connection. Section 2 is deliberately commented out: it grants the
-- executive-level `admin` token and must be explicitly authorised.

-- 1. Read-only account and access diagnosis.
select
  u.id,
  u.email,
  (u.email_confirmed_at is not null) as email_confirmed,
  u.last_sign_in_at,
  u.banned_until,
  coalesce(u.raw_app_meta_data ->> 'role', '') as app_metadata_role,
  coalesce(u.raw_app_meta_data ->> 'app_role', '') as app_metadata_app_role,
  coalesce(u.raw_app_meta_data ->> 'system_role', '') as app_metadata_system_role,
  coalesce(u.raw_app_meta_data -> 'roles', '[]'::jsonb) as app_metadata_roles,
  coalesce(u.raw_app_meta_data -> 'permissions', '[]'::jsonb) as app_metadata_permissions,
  p.role as profile_role
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('alex@arch9.co.za');

-- 2. AUTHORISED RECOVERY ONLY.
-- Confirm that the query above returns exactly one active account belonging to
-- the intended administrator, then remove the comment markers below and run
-- this block. It preserves existing app metadata and records the confirmed
-- executive role in both secure forms recognised by the portal.
--
-- begin;
--
-- with target as (
--   select id
--   from auth.users
--   where lower(email) = lower('alex@arch9.co.za')
-- ), updated as (
--   update auth.users u
--   set raw_app_meta_data = jsonb_set(
--       coalesce(u.raw_app_meta_data, '{}'::jsonb)
--         || jsonb_build_object('role', 'executive'),
--       '{roles}',
--       (
--         select coalesce(jsonb_agg(distinct token), '[]'::jsonb)
--         from (
--           select jsonb_array_elements_text(
--             coalesce(u.raw_app_meta_data -> 'roles', '[]'::jsonb)
--           ) as token
--           union all
--           select 'executive'
--         ) role_tokens
--       ),
--       true
--     ),
--       updated_at = now()
--   from target
--   where u.id = target.id
--   returning u.id, u.email, u.raw_app_meta_data
-- )
-- select
--   id,
--   email,
--   raw_app_meta_data ->> 'role' as restored_role,
--   raw_app_meta_data -> 'roles' as roles,
--   raw_app_meta_data -> 'permissions' as permissions
-- from updated;
--
-- commit;

-- 3. User verification after a successful authorised recovery:
-- sign out of admin.arch9.co.za completely, then sign in again (or use the
-- magic-link option). Existing JWTs retain old app_metadata until refreshed.
