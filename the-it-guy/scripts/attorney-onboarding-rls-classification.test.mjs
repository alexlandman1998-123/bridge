import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    isMissingTableError,
    isPermissionDeniedError,
  } = await server.ssrLoadModule('/src/services/attorneyFirmServiceShared.js')

  const attorneyMembershipRlsError = {
    code: '42501',
    message: 'new row violates row-level security policy for table "attorney_firm_members"',
    status: 403,
  }
  assert.equal(
    isMissingTableError(attorneyMembershipRlsError, 'attorney_firm_members'),
    false,
    'attorney firm member RLS errors must not be classified as missing table errors',
  )
  assert.equal(
    isPermissionDeniedError(attorneyMembershipRlsError),
    true,
    'attorney firm member RLS errors must remain permission-denied errors',
  )

  const permissionForTableError = {
    message: 'permission denied for table attorney_firm_members',
  }
  assert.equal(
    isMissingTableError(permissionForTableError, 'attorney_firm_members'),
    false,
    'plain table permission errors must not be classified as missing table errors',
  )
  assert.equal(
    isPermissionDeniedError(permissionForTableError),
    true,
    'plain table permission errors must remain permission-denied errors',
  )

  assert.equal(
    isMissingTableError(
      {
        code: '42P01',
        message: 'relation "public.attorney_firm_members" does not exist',
      },
      'attorney_firm_members',
    ),
    true,
    'undefined-table errors must still be classified as missing table errors',
  )
  assert.equal(
    isMissingTableError(
      {
        code: 'PGRST205',
        message: "Could not find the table 'attorney_firm_members' in the schema cache",
      },
      'attorney_firm_members',
    ),
    true,
    'PostgREST schema-cache misses must still be classified as missing table errors',
  )

  console.log('attorney onboarding RLS classification tests passed')
} finally {
  await server.close()
}
