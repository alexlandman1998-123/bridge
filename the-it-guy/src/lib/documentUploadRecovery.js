import { notifyDocumentRequirementContextChanged } from '../services/documents/documentRequirementReadService.js'
import { reportDocumentUploadTelemetry } from './documentUploadObservability.js'
import { createDocumentUploadProgressReporter, DOCUMENT_UPLOAD_TIMEOUTS, withDocumentUploadDeadline } from './documentUploadLifecycle.js'

// Keep only object references in browser recovery storage. Never cache portal
// credentials, document contents, or a saved row: recovery must recheck access.
const operations = new Map()
const receipts = new Map()
const prefix = 'arch9:document-upload:v2:'

export function isDefiniteUploadSaveRejection(error) {
  if (['document_save_unconfirmed', '23505'].includes(error?.code)) return false
  const code = String(error?.code || '')
  // Connection failures, server shutdown and missing/invalid replies cannot
  // prove rollback. PGRST116 can occur after an insert with no returned row.
  return /^(22|23|28|40|42)[0-9A-Z]{3}$/.test(code) ||
    /^P000[1-4]$/.test(code) || /^PT[45][0-9]{2}$/.test(code) ||
    ['PGRST102', 'PGRST106', 'PGRST107', 'PGRST108', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code) ||
    Boolean(error?.cause && isDefiniteUploadSaveRejection(error.cause))
}

function recoveryStorage() {
  try { return globalThis.localStorage || null } catch { return null }
}

function readReceipt(key) {
  const stored = recoveryStorage()?.getItem(key)
  if (stored) {
    try { return JSON.parse(stored) } catch { throw new Error('Upload recovery information could not be read. Contact support before uploading this file again.') }
  }
  return receipts.get(key) || {}
}

function writeReceipt(key, receipt) {
  receipts.set(key, receipt)
  const storage = recoveryStorage()
  if (storage) storage.setItem(key, JSON.stringify(receipt))
}

function forgetReceipt(key) {
  receipts.delete(key)
  recoveryStorage()?.removeItem(key)
}

function unconfirmed(cause) {
  return Object.assign(new Error('The upload or save could not be confirmed. Its recovery reference has been kept. Retry to check the saved record before uploading it again.'), {
    code: 'document_save_unconfirmed', cause, retained: true,
  })
}

function rowOf(result) { return result?.data?.document || result?.data }

function savedReceipt(result) {
  const row = rowOf(result) || {}
  return { ...result?.data, ...row, saved: true, documentId: row.id, url: null }
}

export async function readSavedUploadByPath(client, { table = 'documents', column = 'file_path', path, filters = {} }) {
  let query = client.from(table).select('*').eq(column, path)
  for (const [columnName, value] of Object.entries(filters)) query = query.eq(columnName, value)
  const result = await query.maybeSingle()
  if (result.error) throw result.error
  return result.data ? { data: result.data, error: null } : null
}

export async function runRecoverableDocumentUpload({ client, scope, file, run, toSavedReceipt = savedReceipt, storageBuckets = ['documents'], storageResult = bucket => bucket, recoverStorage = null, monitorSurface = null, onProgress = null, timeouts = {} }) {
  const report = createDocumentUploadProgressReporter(onProgress)
  const limits = { ...DOCUMENT_UPLOAD_TIMEOUTS, ...timeouts }
  report('preparing', '', { fileName: file?.name })
  // Commercial metadata-only records do not upload a Storage object.
  if (!file) return run({ path: value => value, upload: upload => upload(), persist: async ({ save }) => { const result = await save(); if (result?.error) throw result.error; return result } })
  // Content, target and audience are part of the identity. Different files with
  // identical names/metadata must never recover one another's saved record.
  const fileDigest = file.arrayBuffer && globalThis.crypto?.subtle
    ? await withDocumentUploadDeadline(async () => crypto.subtle.digest('SHA-256', await file.arrayBuffer()), { timeoutMs: limits.preparing })
    : null
  const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
  let actor = ''
  if (client?.auth?.getUser) {
    const result = await withDocumentUploadDeadline(() => client.auth.getUser(), { timeoutMs: limits.preparing, message: 'Your sign-in could not be checked in time. Please retry.' })
    // Token-scoped public portals intentionally have no Auth session. A
    // failed identity lookup for a signed-in user must not change the retry key.
    if (result.error && result.error.name !== 'AuthSessionMissingError') throw result.error
    actor = result.data?.user?.id || ''
  }
  const identity = JSON.stringify([scope, actor, file.name, file.size, file.type, file.lastModified, fileDigest ? hex(fileDigest) : ''])
  if (!globalThis.crypto?.subtle) throw new Error('Secure upload recovery is unavailable in this browser.')
  const key = prefix + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))
  if (operations.has(key)) return operations.get(key)
  const execute = async () => {
    const state = readReceipt(key)
    let confirmed = null
    let followUpTimer
    let rejectFollowUp
    const followUpDeadline = new Promise((_, reject) => { rejectFollowUp = reject })
    const confirm = result => {
      confirmed = result
      const document = toSavedReceipt(result)
      report('complete', 'Uploaded', { document, documentId: rowOf(result)?.id, fileName: file.name, postUploadProcessing: 'pending' })
      notifyDocumentRequirementContextChanged()
      if (!followUpTimer) followUpTimer = setTimeout(() => rejectFollowUp(Object.assign(new Error('Document saved; linked views are still updating.'), { code: 'document_upload_follow_up_timeout' })), limits.followUp)
    }
    let monitoringStage = 'preparing'
    const recovering = Boolean(state.saveStarted || state.storageStarted)
    const attemptId = state.monitorAttemptId || crypto.randomUUID()
    if (!state.monitorAttemptId) {
      state.monitorAttemptId = attemptId
      // Upgrade an existing recovery receipt without letting an optional
      // monitoring write change the customer's retry outcome.
      if (state.path || state.context || state.saveStarted || state.storageStarted) {
        try { writeReceipt(key, state) } catch { /* Monitoring remains best effort. */ }
      }
    }
    const telemetry = (outcome, error = null) => reportDocumentUploadTelemetry({
      surface: monitorSurface || (Array.isArray(scope) ? scope[0] : 'unknown'), stage: monitoringStage, outcome, error, attemptId,
    })
    telemetry('started')
    const attempt = {
      fileFingerprint: fileDigest ? hex(fileDigest) : null,
      get context() { return state.context },
      setContext(value) { state.context = value; writeReceipt(key, state) },
      saved(result) { confirm(result) },
      path(candidate) {
        if (!state.path) {
          const slash = candidate.lastIndexOf('/')
          state.path = `${candidate.slice(0, slash + 1)}${crypto.randomUUID()}-${candidate.slice(slash + 1)}`
          writeReceipt(key, state)
        }
        return state.path
      },
      async upload(upload) {
        monitoringStage = 'uploading'
        report('uploading', '', { fileName: file.name })
        if (state.uploaded) return state.uploaded
        // A lost Storage response is retained too. Reconciliation must prove
        // the object exists before any metadata is submitted.
        const reconcile = async () => {
          let allMissing = storageBuckets.length > 0
          if (recoverStorage) {
            // Signed, token-scoped uploads reconcile through their authorised
            // API. Only an explicit missing-object result permits the same PUT.
            const exists = await withDocumentUploadDeadline(() => recoverStorage(state.context), { timeoutMs: limits.recovery })
            if (exists === true) {
              state.uploaded = storageResult(storageBuckets[0], state.path)
              writeReceipt(key, state)
              return true
            }
            allMissing = exists === false
          } else for (const bucket of storageBuckets) {
            try {
              const result = await withDocumentUploadDeadline(() => client.storage.from(bucket).createSignedUrl(state.path, 60), { timeoutMs: limits.recovery })
              if (!result.error && result.data?.signedUrl) {
                state.uploaded = storageResult(bucket, state.path)
                writeReceipt(key, state)
                return true
              }
              const missing = Number(result.error?.statusCode || result.error?.status) === 404 || /(?:object|bucket) (?:not found|does not exist)/i.test(String(result.error?.message || ''))
              if (!missing) allMissing = false
            } catch { allMissing = false }
          }
          return allMissing ? false : null
        }
        if (state.storageStarted) {
          const exists = await reconcile()
          if (exists === true) return state.uploaded
          if (exists !== false) throw unconfirmed()
          // A confirmed missing object may be retried at the SAME path. Every
          // upload callback uses upsert:false, so an earlier PUT finishing late
          // cannot create a second file or overwrite the selected bytes.
        }
        state.storageStarted = true
        writeReceipt(key, state)
        try {
          state.uploaded = await withDocumentUploadDeadline(upload, { timeoutMs: limits.uploading, message: 'The transfer took too long. Retry will check this file before sending it again.' })
          writeReceipt(key, state)
          return state.uploaded
        } catch (error) {
          const conflict = [error, error?.cause].some(value => value?.code === '23505' || /duplicate|already.?exists/i.test(`${value?.code || ''} ${value?.message || ''}`))
          if (!conflict && (isDefiniteUploadSaveRejection(error) || [400, 401, 403, 404, 413, 415].includes(Number(error?.statusCode || error?.status || error?.cause?.statusCode || error?.cause?.status)))) {
            forgetReceipt(key)
            throw error
          }
          // A successful transfer can lose only its reply. Check the exact
          // retained path now so the client need not click Retry to save it.
          // This check never resends bytes or interprets a denied read as absence.
          try { if (await reconcile() === true) return state.uploaded } catch { /* Keep the recovery reference. */ }
          throw unconfirmed(error)
        }
      },
      async persist({ save, read, cleanup = null, isSaved = result => Boolean(rowOf(result)?.id) }) {
        monitoringStage = 'saving'
        report('saving', '', { fileName: file.name })
        const recover = async () => {
          const result = await withDocumentUploadDeadline(read, { timeoutMs: limits.recovery })
          if (!isSaved(result)) return null
          confirm(result)
          state.confirmed = true
          writeReceipt(key, state)
          return result
        }
        if (state.saveStarted) {
          // An empty read does not prove that an earlier timed-out request has
          // stopped executing. Never resubmit that write blindly.
          try { return await recover() || Promise.reject(unconfirmed()) } catch (error) { throw unconfirmed(error) }
        }
        state.saveStarted = true
        writeReceipt(key, state)
        let result
        let failure
        try {
          result = await withDocumentUploadDeadline(save, { timeoutMs: limits.saving, message: 'The save took too long. Checking whether the document was saved…' })
          if (result?.error) throw result.error
          if (!isSaved(result)) throw unconfirmed()
          confirm(result)
          state.confirmed = true
          writeReceipt(key, state)
          return result
        } catch (error) { failure = error }
        try {
          const recovered = await recover()
          if (recovered) return recovered
        } catch { /* Failed or denied reads cannot establish absence. */ }
        if (isDefiniteUploadSaveRejection(failure) && failure?.code !== '23505') {
          // Cleanup is only allowed for a definite rejection of this first
          // submission. No earlier uncertain mutation was replayed.
          try { if (cleanup) await withDocumentUploadDeadline(cleanup, { timeoutMs: limits.recovery }) } catch { /* Retain an unlinked object rather than obscure the rejection. */ }
          forgetReceipt(key)
          throw failure
        }
        throw unconfirmed(failure)
      },
    }
    try {
      const result = await Promise.race([Promise.resolve().then(() => run(attempt)), followUpDeadline])
      monitoringStage = 'persistence'
      telemetry(result?.persistenceWarnings?.length ? 'attention' : recovering ? 'recovered' : 'succeeded')
      report('complete', 'Uploaded', { document: result, documentId: result?.id || rowOf(confirmed)?.id, fileName: file.name, warnings: result?.persistenceWarnings || result?.persistence?.warnings || [] })
      notifyDocumentRequirementContextChanged()
      return result
    } catch (error) {
      if (!confirmed) {
        telemetry(error?.code === 'document_save_unconfirmed' ? 'unconfirmed' : 'failed', error)
        report('failed', error?.message || '', { fileName: file.name, error })
        throw error
      }
      monitoringStage = 'followUp'
      telemetry('attention', error)
      const receipt = toSavedReceipt(confirmed)
      const warning = 'Document saved, but a follow-up or preview could not be refreshed. Reopen the record; the file does not need to be uploaded again.'
      report('complete', 'Uploaded', { document: receipt, documentId: rowOf(confirmed)?.id, fileName: file.name, warnings: [warning], postUploadProcessing: 'pending' })
      return { ...receipt, saved: true, postUploadProcessing: 'pending', persistenceWarnings: [warning],
        persistence: { ...receipt.persistence, status: 'verified_with_attention', recordVerified: true, warnings: [warning] } }
    } finally { clearTimeout(followUpTimer) }
  }
  // Web Locks coordinate the same retry across tabs. Every recovered record is
  // still read through the caller's current authenticated/token-scoped client.
  const acquireAndExecute = async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), limits.preparing)
    try {
      return await navigator.locks.request(key, { signal: controller.signal }, () => {
        // Only queueing is bounded here; the granted upload has its own deadlines.
        clearTimeout(timer)
        return execute()
      })
    } catch (error) {
      if (!controller.signal.aborted) throw error
      const busy = Object.assign(new Error('This file is being processed in another tab. Close that upload or wait briefly, then retry.'), { code: 'document_upload_busy' })
      report('failed', busy.message, { fileName: file.name, error: busy })
      throw busy
    } finally { clearTimeout(timer) }
  }
  const operation = globalThis.navigator?.locks?.request ? acquireAndExecute() : execute()
  operations.set(key, operation)
  try { return await operation } finally { operations.delete(key) }
}
