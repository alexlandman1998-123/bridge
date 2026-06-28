import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  schema: await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'),
  migration: await readFile(new URL('../sql/20260628_developments_address_columns.sql', import.meta.url), 'utf8'),
}

for (const token of [
  'DEVELOPMENT_CREATE_OPTIONAL_COLUMNS',
  "'postal_code'",
  'isDevelopmentCreateMissingColumnError',
  'isMissingColumnError(error, columnName)',
  'isDevelopmentCreateMissingColumnError(result.error)',
  ".insert({ name: trimmedName, planned_units: Math.trunc(normalizedPlannedUnits) })",
]) {
  assert(files.api.includes(token), `api.js should include ${token}`)
}

for (const column of [
  'address',
  'formatted_address',
  'street_address',
  'postal_code',
  'latitude',
  'longitude',
  'google_place_id',
]) {
  const statement = `alter table if exists developments add column if not exists ${column}`
  assert(files.schema.includes(statement), `schema.sql should include ${statement}`)
  assert(files.migration.includes(statement), `migration should include ${statement}`)
}

console.log('Development create schema-cache fallback contract passed.')
