import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

  const attorneyBrandingStorageMigration = readFileSync(
    new URL('../../supabase/migrations/202607080008_attorney_firm_branding_storage_rls.sql', import.meta.url),
    'utf8',
  )
  assert.match(
    attorneyBrandingStorageMigration,
    /attorney_firm_branding_owner_insert/,
    'Attorney onboarding should install a storage insert policy for logo uploads.',
  )
  assert.match(
    attorneyBrandingStorageMigration,
    /bucket_id in \('organisation-branding', 'documents'\)/,
    'Attorney logo storage should work with the branding bucket and documents fallback bucket.',
  )
  assert.match(
    attorneyBrandingStorageMigration,
    /\(storage\.foldername\(name\)\)\[1\] = 'attorney-firms'/,
    'Attorney logo storage policies should be scoped to the attorney firm branding folder.',
  )
  assert.match(
    attorneyBrandingStorageMigration,
    /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/,
    'Attorney logo storage policies should only allow users to manage their own onboarding assets.',
  )

  const attorneyBrandingMetadataMigration = readFileSync(
    new URL('../../supabase/migrations/202607080009_attorney_firm_branding_metadata_persistence.sql', import.meta.url),
    'utf8',
  )
  assert.match(
    attorneyBrandingMetadataMigration,
    /add column if not exists logo_bucket text/,
    'Attorney firm branding should store the primary logo bucket.',
  )
  assert.match(
    attorneyBrandingMetadataMigration,
    /add column if not exists logo_dark_path text/,
    'Attorney firm branding should store the dark logo path.',
  )
  assert.match(
    attorneyBrandingMetadataMigration,
    /f\.created_by = auth\.uid\(\)/,
    'Attorney firm branding RLS should allow the firm creator during onboarding bootstrap.',
  )

  const attorneyFirmServiceSource = readFileSync(
    new URL('../src/services/attorneyFirms.js', import.meta.url),
    'utf8',
  )
  assert.match(
    attorneyFirmServiceSource,
    /const ATTORNEY_BRANDING_BUCKET_CANDIDATES = Array\.from\(/,
    'Attorney logo uploads should use attorney-specific branding bucket ordering.',
  )
  assert.match(
    attorneyFirmServiceSource,
    /resolvedUrl: publicUrl \|\| signedUrl/,
    'Attorney logo uploads should prefer durable public URLs over expiring signed URLs.',
  )
  assert.match(
    attorneyFirmServiceSource,
    /logo_dark_bucket: normalizeNullableText\(branding\.logoDarkBucket\)/,
    'Attorney branding persistence should include the dark logo bucket.',
  )
  assert.match(
    attorneyFirmServiceSource,
    /saveAttorneyFirmBranding\(requireClient\(\), createdFirm\.id, branding/,
    'Attorney onboarding activation should persist the branding metadata row.',
  )
  assert.match(
    attorneyFirmServiceSource,
    /hasAttorneyBrandingPayload\(payload\)[\s\S]*saveAttorneyFirmBranding\(client, normalizedFirmId, payload\)/,
    'Generic attorney firm updates should only write branding rows when branding fields are supplied.',
  )

  const attorneySharedServiceSource = readFileSync(
    new URL('../src/services/attorneyFirmServiceShared.js', import.meta.url),
    'utf8',
  )
  assert.match(
    attorneySharedServiceSource,
    /logoDarkPath: row\.logo_dark_path \|\| ''/,
    'Attorney firm row mapping should expose dark logo metadata.',
  )

  const brandingStepSource = readFileSync(
    new URL('../src/components/attorney/onboarding/BrandingStep.jsx', import.meta.url),
    'utf8',
  )
  assert.match(
    brandingStepSource,
    /accept="image\/png,image\/jpeg,image\/jpg,image\/webp,image\/svg\+xml"/,
    'Attorney branding upload control should accept the same image types as the service and bucket.',
  )

  console.log('attorney onboarding RLS classification tests passed')
} finally {
  await server.close()
}
