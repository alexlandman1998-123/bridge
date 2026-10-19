import { runRecoverableDocumentUpload } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient.js'
import { stagedBuyerLeadDocumentRows } from './buyerLeadDocumentHandoffService.js'

// Keep the immutable object reference across uncertain lead saves. The lead is
// the durable owner until conversion, so a lost response must never delete bytes.
export async function uploadStagedBuyerLeadDocument({ client, organisationId, leadId, documentKey, file, path, upload, buildDocument, save, onProgress }) {
  return runRecoverableDocumentUpload({ client, scope: ['buyer_lead', organisationId, leadId, documentKey], file,
    onProgress, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES, storageResult: bucket => ({ storageBucket: bucket }),
    toSavedReceipt: result => result.data,
    run: async attempt => {
      const objectPath = attempt.path(path)
      const stored = await attempt.upload(() => upload(objectPath))
      const document = buildDocument({ ...stored, storagePath: objectPath })
      const read = async () => {
        const result = await client.from('leads').select('raw_enquiry_payload').eq('organisation_id', organisationId).eq('lead_id', leadId).maybeSingle()
        if (result.error) throw result.error
        const row = stagedBuyerLeadDocumentRows(result.data).find(candidate =>
          (candidate.storagePath || candidate.storage_path) === objectPath &&
          (candidate.storageBucket || candidate.storage_bucket) === stored.storageBucket)
        return row ? { data: row } : null
      }
      const saved = await attempt.persist({
        save: async () => { await save(document); return read() }, read,
        isSaved: result => Boolean(result?.data?.storagePath || result?.data?.storage_path),
        cleanup: async () => {
          const result = await client.storage.from(stored.storageBucket).remove([objectPath])
          if (result.error) throw result.error
        },
      })
      return saved.data
    },
  })
}
