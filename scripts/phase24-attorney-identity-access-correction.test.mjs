#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('docs/supabase-phase-5-application-manifest.json', 'utf8'))
const foundation = readFileSync('supabase/migrations/202607209901_attorney_professional_role_persistence_phase24_fix.sql', 'utf8')
const cutover = readFileSync('supabase/migrations/202607209902_attorney_professional_permission_cutover_phase24_fix.sql', 'utf8')

assert.match(foundation, /add column if not exists professional_role text/i)
assert.match(foundation, /bridge_attorney_professional_to_compatibility_role/i)
assert.match(foundation, /attorney_firm_members_sync_organisation_extension/i)
assert.match(foundation, /is distinct from afm\.professional_role/i)
assert.match(cutover, /m\.professional_role = 'firm_admin'/i)
assert.match(cutover, /m\.professional_role in \('firm_admin', 'director_partner'\)/i)
assert.match(cutover, /grant execute on function public\.bootstrap_attorney_firm_admin_membership\(uuid\) to authenticated/i)

const byVersion = new Map(manifest.rows.map((row) => [row.version, row]))
assert.ok(manifest.rows.length >= 70)
assert.equal(byVersion.get('202607209901')?.action, 'apply_original_after_dependency_check')
assert.equal(byVersion.get('202607180037')?.dependsOn, '202607209901')
assert.equal(byVersion.get('202607180037')?.action, 'repair_only_after_smoke')
assert.equal(byVersion.get('202607209902')?.dependsOn, '202607180039')
assert.equal(byVersion.get('202607180040')?.dependsOn, '202607209902')
assert.equal(byVersion.get('202607180040')?.action, 'repair_only_after_smoke')

console.log('Phase 24 attorney identity/access corrective migration contract passed.')
