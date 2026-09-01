import assert from 'node:assert/strict'
import fs from 'node:fs'

const migrationPath = new URL('../../supabase/migrations/20260901145225_property24_commercial_canonical_backfill.sql', import.meta.url)
const sql = fs.readFileSync(migrationPath, 'utf8')

assert.match(sql, /^begin;/)
assert.match(sql, /commit;\s*$/)
assert.doesNotMatch(sql, /create\s+table/i)
assert.match(sql, /row_number\(\) over \(partition by l\.property_id order by l\.updated_at desc, l\.id desc\) as row_rank/i)
assert.match(sql, /select \* from ranked_listing_facts where row_rank = 1/i)
assert.match(sql, /coalesce\(p\.gla_m2/i)
assert.match(sql, /coalesce\(l\.operating_costs/i)
assert.match(sql, /Remove only legacy keys that have a confirmed canonical listing column/i)

const propertyBackfill = sql.indexOf('update public.commercial_properties p')
const legacyCleanup = sql.indexOf('Remove only legacy keys')
assert.ok(propertyBackfill > 0 && legacyCleanup > propertyBackfill, 'property facts must be copied before legacy metadata is removed')
assert.equal((sql.match(/metadata_json = case/g) || []).length, 1, 'the cleanup must assign metadata_json only once per statement')

console.log('Property24 commercial canonical backfill migration checks passed')
