import { createServer } from 'vite'

function hasArg(name) {
  return process.argv.includes(name)
}

function summarizeRows(rows = [], limit = 50) {
  return rows.slice(0, limit)
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

async function fetchAll(client, table) {
  const result = await client.from(table).select('*')
  if (result.error) throw result.error
  return result.data || []
}

async function main() {
  const write = hasArg('--write')
  const confirmed = hasArg('--confirm-staging') && process.env.CANONICAL_STAGING_BACKFILL_WRITE === 'true'
  if (write && !confirmed) {
    throw new Error('Write mode requires --confirm-staging and CANONICAL_STAGING_BACKFILL_WRITE=true.')
  }

  const server = await createServer({
    root: process.cwd(),
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const { supabase, isSupabaseConfigured } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
    const {
      STAGING_BACKFILL_RESOLVER_VERSION,
      STAGING_BACKFILL_SOURCE,
      buildCanonicalInstanceGenerationPlan,
      writeCanonicalInstanceGenerationPlan,
    } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentStagingBackfillService.js')

    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase is not configured. Cannot run canonical staging backfill planner.')
    }

    const [
      canonicalDefinitions,
      canonicalInstances,
      transactionRequiredDocuments,
      documentRequests,
      documents,
      privateListingDocuments,
    ] = await Promise.all([
      fetchAll(supabase, 'document_definitions'),
      fetchAll(supabase, 'document_requirement_instances'),
      fetchAll(supabase, 'transaction_required_documents'),
      fetchAll(supabase, 'document_requests'),
      fetchAll(supabase, 'documents'),
      fetchAll(supabase, 'private_listing_documents'),
    ])

    const plan = buildCanonicalInstanceGenerationPlan({
      canonicalDefinitions,
      canonicalInstances,
      transactionRequiredDocuments,
      documentRequests,
      documents,
      privateListingDocuments,
      sourceSystem: STAGING_BACKFILL_SOURCE,
      resolverVersion: STAGING_BACKFILL_RESOLVER_VERSION,
    })

    const writeResult = await writeCanonicalInstanceGenerationPlan({
      client: supabase,
      plan,
      write,
    })

    const report = {
      mode: write ? 'write' : 'dry_run',
      mutatedData: Boolean(write),
      rolloutModeChanged: false,
      externalRemindersEnabled: false,
      hardWorkflowBlocksEnabled: false,
      sourceSystem: STAGING_BACKFILL_SOURCE,
      resolverVersion: STAGING_BACKFILL_RESOLVER_VERSION,
      sourceRowCounts: plan.sourceRowCounts,
      candidateContextCount: plan.candidateContextCount,
      candidateInstanceCount: plan.candidateInstanceCount,
      definitionsUsed: plan.definitionsUsed,
      packsUsed: plan.packsUsed,
      skippedExistingCount: plan.skippedExistingCount,
      impossibleOrMissingFactsCount: plan.impossibleOrMissingFacts.length,
      impossibleOrMissingFactsByReason: Object.entries(plan.impossibleOrMissingFacts.reduce((accumulator, item) => {
        accumulator[item.reason] = (accumulator[item.reason] || 0) + 1
        return accumulator
      }, {})).map(([key, count]) => ({ key, count })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
      manualReviewPreview: summarizeRows(plan.impossibleOrMissingFacts),
      writeResult: {
        dryRun: writeResult.dryRun,
        insertedInstances: writeResult.insertedInstances,
        insertedEvents: writeResult.insertedEvents,
      },
      controlledWriteCommand: 'CANONICAL_STAGING_BACKFILL_WRITE=true npm run backfill:canonical-documents:staging -- --write --confirm-staging',
    }

    console.log(safeJson(report))
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
