import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { loadCanonicalVerificationSnapshot } from './canonical-document-verification-snapshot.mjs'

const TRANSACTION_ID = '5db513ad-5736-46fe-bd8f-6b298d1d791d'

const expectedMappings = [
  ['generated_mandate', 'generated_mandate', false],
  ['signed_mandate', 'mandate_signature', true],
  ['generated_otp', 'generated_otp', false],
  ['signed_otp', 'otp', true],
  ['transfer_documents', 'transfer_documents', false],
  ['signed_transfer_documents', 'signed_transfer_pack', true],
  ['signed_packet_version', 'final_signed_packet', true],
  ['signed_addendum', 'signed_addendum', true],
]

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
  assert.ok(isSupabaseConfigured && supabase, 'Supabase must be configured for packet fixture verification')

  const data = await loadCanonicalVerificationSnapshot(supabase)

  const requirements = data.document_requirement_instances || []
  const legacyRequirements = data.transaction_required_documents || []
  const packets = data.document_packets || []
  const versions = data.document_packet_versions || []

  const fixturePackets = packets.filter((packet) =>
    packet.transaction_id === TRANSACTION_ID &&
    packet.source_context_json?.fixture === 'canonical_packet_fixture_v1'
  )
  const fixtureVersions = versions.filter((version) =>
    fixturePackets.some((packet) => packet.id === version.packet_id)
  )

  assert.equal(fixturePackets.length, expectedMappings.length, 'fixture should have one packet per expected mapping')
  assert.equal(fixtureVersions.length, expectedMappings.length, 'fixture should have one packet version per expected mapping')

  for (const [canonicalKey, legacyKey, expectsFinal] of expectedMappings) {
    const requirement = requirements.find((row) =>
      row.transaction_id === TRANSACTION_ID &&
      row.context_type === 'transaction' &&
      row.context_id === TRANSACTION_ID &&
      row.document_definition_key === canonicalKey
    )
    assert.ok(requirement, `${canonicalKey} requirement should exist`)
    assert.equal(requirement.status, 'completed', `${canonicalKey} should be completed`)
    assert.ok(requirement.satisfied_by_packet_id, `${canonicalKey} should have satisfied_by_packet_id`)
    assert.ok(requirement.satisfied_by_packet_version_id, `${canonicalKey} should have satisfied_by_packet_version_id`)

    const packet = fixturePackets.find((row) => row.id === requirement.satisfied_by_packet_id)
    const version = fixtureVersions.find((row) => row.id === requirement.satisfied_by_packet_version_id)
    assert.ok(packet, `${canonicalKey} packet should be present in fixture packet set`)
    assert.ok(version, `${canonicalKey} packet version should be present in fixture version set`)
    assert.equal(packet.canonical_requirement_instance_id, requirement.id, `${canonicalKey} packet should link back to requirement`)
    assert.equal(version.canonical_requirement_instance_id, requirement.id, `${canonicalKey} version should link back to requirement`)
    assert.equal(version.packet_id, packet.id, `${canonicalKey} version should belong to packet`)

    const legacy = legacyRequirements.find((row) =>
      row.transaction_id === TRANSACTION_ID &&
      row.document_key === legacyKey
    )
    assert.ok(legacy, `${canonicalKey} legacy projection ${legacyKey} should exist`)
    assert.equal(legacy.canonical_requirement_instance_id, requirement.id, `${canonicalKey} legacy projection should link to requirement`)
    assert.equal(legacy.status, 'accepted', `${canonicalKey} legacy projection should be accepted`)
    assert.equal(legacy.is_uploaded, true, `${canonicalKey} legacy projection should be uploaded`)

    if (expectsFinal) {
      assert.ok(version.final_signed_file_path, `${canonicalKey} should expose final signed artifact path`)
    } else {
      assert.equal(version.final_signed_file_path, null, `${canonicalKey} should remain generated-only`)
    }
  }

  const looseFixturePackets = fixturePackets.filter((packet) => {
    const version = fixtureVersions.find((item) => item.packet_id === packet.id)
    return !packet.canonical_requirement_instance_id || !version?.canonical_requirement_instance_id
  })
  assert.deepEqual(looseFixturePackets, [], 'fixture should not contain loose packet artifacts')

  console.log('canonical-document-packet-fixture tests passed')
} finally {
  await server.close()
}
