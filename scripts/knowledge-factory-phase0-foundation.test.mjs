import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const migration = await readFile(resolve(root, 'supabase/migrations/20260909185627_knowledge_factory_phase0_foundation.sql'), 'utf8')
const functionSource = await readFile(resolve(root, 'supabase/functions/knowledge-factory-graphql/index.ts'), 'utf8')
const config = await readFile(resolve(root, 'supabase/config.toml'), 'utf8')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

expect(migration.includes('create table public.knowledge_factory_organisation_access'), 'Missing organisation entitlement table.')
expect(migration.includes('create table public.knowledge_factory_user_permissions'), 'Missing named-user permission table.')
expect(migration.includes('create table public.knowledge_factory_audit_log'), 'Missing audit table.')
expect(migration.includes('enable row level security'), 'Knowledge Factory tables must use RLS.')
expect(migration.includes('knowledge_factory_audit_log_immutable'), 'Audit log must be immutable.')
expect(functionSource.includes('verify_jwt') === false, 'JWT verification belongs in config, not a client-controlled request.')
expect(config.includes('[functions.knowledge-factory-graphql]') && config.includes('verify_jwt = true'), 'Gateway must require a verified JWT.')
expect(functionSource.includes('GraphQL-Cost": "validate"'), 'Phase 0 must use cost validation rather than live map execution.')
expect(!functionSource.includes('localStorage'), 'Supplier tokens must never be stored in browser storage.')
expect(functionSource.includes('KNOWLEDGE_FACTORY_PASSWORD'), 'Supplier credentials must be read from server secrets.')
expect(migration.includes("'fica_kyc'"), 'FICA/KYC must be represented consistently in the permission contract.')

console.log('Knowledge Factory Phase 0 foundation checks passed.')
