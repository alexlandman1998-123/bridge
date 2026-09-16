import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../../supabase/migrations/20260916121032_website_listing_optional_metadata.sql', import.meta.url), 'utf8')

assert.match(migration, /create or replace function public\.website_get_listing_publication_status/i)
assert.match(migration, /create or replace function public\.website_commit_listing_publication/i)
assert.match(migration, /bridge_is_active_member/)
assert.match(migration, /member\.organisation_id = v_listing\.organisation_id/)
assert.match(migration, /Complete the public title, listing type and price before publishing\./)
assert.doesNotMatch(migration, /Select a public property type\./)
assert.doesNotMatch(migration, /Add the listing suburb\./)
assert.doesNotMatch(migration, /property_type\), ''\) is null/)
assert.doesNotMatch(migration, /suburb\), ''\) is null/)

console.log('website listing optional metadata migration checks passed')
