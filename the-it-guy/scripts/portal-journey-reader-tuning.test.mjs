import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const migration = await readFile(
  resolve(process.cwd(), '../supabase/migrations/20260912143012_tune_portal_journey_readers.sql'),
  'utf8',
);

assert.match(
  migration,
  /create or replace function journey_private\.resolve_seller_portal_context\(/i,
  'Seller journey reads need a narrow authenticated context resolver.',
);
assert.match(
  migration,
  /seller_portal_access_token_hash is distinct from v_access_hash/i,
  'The narrow resolver must retain seller session validation.',
);
assert.match(
  migration,
  /create or replace function public\.bridge_read_seller_shared_matter_journey/i,
  'Seller journey reader must use the narrow resolver.',
);

const readerDefinition = (
  migration.match(
    /create or replace function public\.bridge_read_seller_shared_matter_journey[\s\S]*?\$\$;/i,
  ) ?? []
)[0] ?? '';
assert.doesNotMatch(
  readerDefinition,
  /bridge_private_listing_seller_portal_payload/i,
  'Journey polling must not hydrate the complete seller portal payload.',
);
assert.match(
  migration,
  /create or replace function journey_private\.conversation_actor/i,
  'Conversation refresh must reuse the narrow seller resolver.',
);

console.log('portal journey reader tuning checks passed');
