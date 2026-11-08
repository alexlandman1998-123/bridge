import { expect, it, vi } from 'vitest'

vi.mock('../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: false, supabase: null }))
import { isMissingTableError } from '../attorneyFirmServiceShared.js'

it.each([
  ['42P01', 'relation transactions does not exist', true],
  ['PGRST205', 'Could not find the table transactions in the schema cache', true],
  ['42703', 'column transactions.arch9_listing_reference does not exist', false],
  ['PGRST204', "Could not find the 'partner_connection_id' column of 'transactions' in the schema cache", false],
  ['PGRST202', 'Could not find the function transactions_read in the schema cache', false],
  ['42501', 'permission denied for table transactions', false],
  ['', 'column transactions.arch9_listing_reference does not exist', false],
  ['', 'relation transactions does not exist', true],
])('classifies %s without hiding another database failure', (code, message, expected) => {
  expect(isMissingTableError({ code, message }, 'transactions')).toBe(expected)
})
