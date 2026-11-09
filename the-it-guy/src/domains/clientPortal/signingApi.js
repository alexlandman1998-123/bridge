// clientPortal owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket } from '../../lib/api/shared/storage.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { normalizeNullableText, requireClient, isMissingColumnError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { OTP_DOCUMENT_TYPES, normalizeOtpDocumentType } from '../../core/transactions/salesWorkflow'
import { buildCanonicalSigningSession } from '../../core/documents/signingSessionContract'
import { buildSigningCompletion } from '../../core/documents/signingCompletionContract'
import { normalizeRoleType } from '../../core/transactions/permissions'
import { requireClientPortalTokenClient } from './appointmentRead.js'
import { sanitizeFilePart, createClientPortalDocumentSignedUrl } from './documentApi.js'
import { runDocumentAutomationIfPossible } from '../documents/uploadAutomation.js'
import { addTransactionDiscussionComment } from '../transactions/discussionApi.js'
import { resolveClientPortalLinkByToken } from './originatorFinanceRead.js'
import { triggerPostSigningWorkflowIfNeeded } from '../access/roleplayerActivation.js'

export async function resolveLatestOtpDocumentForTransaction(client, transactionId) {
  const otpTypes = [
    OTP_DOCUMENT_TYPES.generated,
    OTP_DOCUMENT_TYPES.pendingApproval,
    OTP_DOCUMENT_TYPES.approved,
    OTP_DOCUMENT_TYPES.sentToClient,
  ]

  let query = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, file_path, created_at')
    .eq('transaction_id', transactionId)
    .in('document_type', otpTypes)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    query.error &&
    (isMissingColumnError(query.error, 'document_type') || isMissingColumnError(query.error, 'transaction_id'))
  ) {
    query = await client
      .from('documents')
      .select('id, transaction_id, name, category, file_path, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    throw query.error
  }

  if (query.data?.id) {
    return query.data
  }

  const rows = Array.isArray(query.data) ? query.data : []
  const otpDocument = rows.find((row) => {
    const haystack = `${row?.document_type || ''} ${row?.category || ''} ${row?.name || ''}`.toLowerCase()
    if (haystack.includes('signed otp')) return false
    return haystack.includes('otp') || haystack.includes('offer to purchase')
  })

  return otpDocument || null
}

async function resolveLatestSignedOtpDocumentForTransaction(client, transactionId) {
  let query = await client
    .from('documents')
    .select('id, transaction_id, name, category, document_type, file_path, created_at')
    .eq('transaction_id', transactionId)
    .eq('document_type', OTP_DOCUMENT_TYPES.signedFinal)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (query.error && isMissingColumnError(query.error, 'document_type')) {
    query = await client
      .from('documents')
      .select('id, transaction_id, name, category, file_path, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })
  }
  if (query.error) throw query.error
  if (query.data?.id) return query.data

  const rows = Array.isArray(query.data) ? query.data : []
  return rows.find((row) => {
    const haystack = `${row?.category || ''} ${row?.name || ''}`.toLowerCase()
    return haystack.includes('signed') && (haystack.includes('otp') || haystack.includes('offer to purchase'))
  }) || null
}

export const PHASE0_LEGACY_OTP_SIGNING_DISABLED =
  'Legacy OTP sending and signature finalization are disabled in Phase 0. Use the canonical document packet workflow.'

export async function updateOtpDocumentWorkflowState({
  documentId,
  workflowState = OTP_DOCUMENT_TYPES.pendingApproval,
  isClientVisible = null,
  clientOverride = null,
}) {
  if (!documentId) {
    throw new Error('Document is required.')
  }

  const requestedType = normalizeOtpDocumentType(workflowState) || OTP_DOCUMENT_TYPES.pendingApproval
  if (
    [OTP_DOCUMENT_TYPES.sentToClient, OTP_DOCUMENT_TYPES.signedReuploaded, OTP_DOCUMENT_TYPES.signedFinal].includes(requestedType) ||
    isClientVisible === true
  ) {
    throw new Error(PHASE0_LEGACY_OTP_SIGNING_DISABLED)
  }

  const client = clientOverride || requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  const normalizedType = requestedType
  const categoryByState = {
    [OTP_DOCUMENT_TYPES.generated]: 'Offer to Purchase (OTP) · Generated',
    [OTP_DOCUMENT_TYPES.pendingApproval]: 'Offer to Purchase (OTP) · Pending Approval',
    [OTP_DOCUMENT_TYPES.approved]: 'Offer to Purchase (OTP) · Approved',
    [OTP_DOCUMENT_TYPES.sentToClient]: 'Offer to Purchase (OTP) · Sent to Client',
    [OTP_DOCUMENT_TYPES.signedReuploaded]: 'Signed OTP',
    [OTP_DOCUMENT_TYPES.signedFinal]: 'Offer to Purchase (OTP) · Signed Final',
  }
  const visibilityScope = typeof isClientVisible === 'boolean' ? (isClientVisible ? 'shared' : 'internal') : null

  const payload = {
    category: categoryByState[normalizedType] || 'Offer to Purchase (OTP)',
    document_type: normalizedType,
  }

  if (typeof isClientVisible === 'boolean') {
    payload.is_client_visible = isClientVisible
    payload.visibility_scope = visibilityScope
  }

  let updateQuery = await client
    .from('documents')
    .update(payload)
    .eq('id', documentId)
    .select(
      'id, transaction_id, name, category, document_type, stage_key, visibility_scope, is_client_visible, created_at',
    )
    .single()

  if (
    updateQuery.error &&
    (isMissingColumnError(updateQuery.error, 'document_type') ||
      isMissingColumnError(updateQuery.error, 'visibility_scope') ||
      isMissingColumnError(updateQuery.error, 'is_client_visible') ||
      isMissingColumnError(updateQuery.error, 'stage_key'))
  ) {
    const fallbackPayload = {}
    fallbackPayload.category = categoryByState[normalizedType] || 'Offer to Purchase (OTP)'
    if (typeof isClientVisible === 'boolean') {
      fallbackPayload.is_client_visible = isClientVisible
    }

    if (Object.keys(fallbackPayload).length) {
      updateQuery = await client
        .from('documents')
        .update(fallbackPayload)
        .eq('id', documentId)
        .select('id, transaction_id, name, category, is_client_visible, created_at')
        .single()
    }
  }

  if (updateQuery.error) {
    throw updateQuery.error
  }

  await logTransactionEventIfPossible(client, {
    transactionId: updateQuery.data?.transaction_id || null,
    eventType: 'DocumentVisibilityChanged',
    createdBy: activeProfile.userId || null,
    createdByRole: activeProfile.role || null,
    eventData: {
      source: 'otp_workflow',
      documentId: updateQuery.data?.id || documentId,
      workflowState: normalizedType,
      isClientVisible:
        typeof updateQuery.data?.is_client_visible === 'boolean'
          ? updateQuery.data.is_client_visible
          : typeof isClientVisible === 'boolean'
            ? isClientVisible
            : null,
    },
  })

  return updateQuery.data
}

function decodeDataUrlToFile(dataUrl, fileName = 'signature.png') {
  const normalized = String(dataUrl || '').trim()
  const match = normalized.match(/^data:(.+?);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid signature data provided.')
  }

  const mimeType = match[1] || 'image/png'
  const base64 = match[2] || ''
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }

  return new File([bytes], fileName, { type: mimeType })
}

function escapePdfTextValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function buildSimplePdfBytesFromLines(lines = []) {
  const encoder = new TextEncoder()
  const safeLines = (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 36)
  const startY = 780
  const lineHeight = 18
  const textOperations = safeLines
    .map((line, index) => {
      const y = Math.max(72, startY - index * lineHeight)
      return `BT /F1 12 Tf 50 ${y} Td (${escapePdfTextValue(line)}) Tj ET`
    })
    .join('\n')
  const contentStream = `${textOperations}\n`
  const contentStreamLength = encoder.encode(contentStream).length

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentStreamLength} >>\nstream\n${contentStream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets[index + 1] = encoder.encode(output).length
    output += objects[index]
  }

  const xrefOffset = encoder.encode(output).length
  output += `xref\n0 ${objects.length + 1}\n`
  output += '0000000000 65535 f \n'
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return encoder.encode(output)
}

function buildSignedOtpSummaryPdfFile({
  transactionReference = '',
  developmentName = '',
  unitLabel = '',
  buyerName = '',
  signatureName = '',
  signedAtIso = '',
  sourceDocumentName = '',
  sourceDocumentPath = '',
  fileName = '',
} = {}) {
  const signedAtLabel = (() => {
    const date = new Date(signedAtIso || Date.now())
    if (Number.isNaN(date.getTime())) return String(signedAtIso || '').trim()
    return date.toLocaleString()
  })()

  const lines = [
    'Arch9 - Signed Offer to Purchase (OTP)',
    '',
    `Transaction: ${transactionReference || 'N/A'}`,
    `Property: ${[developmentName, unitLabel].filter(Boolean).join(' - ') || 'N/A'}`,
    `Buyer: ${buyerName || 'N/A'}`,
    `Signed by: ${signatureName || buyerName || 'Client'}`,
    `Signed at: ${signedAtLabel || 'N/A'}`,
    '',
    'Digital signing confirmation',
    'The client has completed digital confirmation and signature for the Offer to Purchase.',
    '',
    `Original OTP document: ${sourceDocumentName || 'Offer to Purchase (OTP)'}`,
    `Original document path: ${sourceDocumentPath || 'N/A'}`,
    '',
    'Generated by Arch9 Transaction Workspace',
  ]

  const bytes = buildSimplePdfBytesFromLines(lines)
  const resolvedFileName = String(fileName || '').trim() || `signed-otp-${Date.now()}.pdf`
  return new File([bytes], resolvedFileName, { type: 'application/pdf' })
}

export async function finalizeSignedOtpWorkflow({ transactionId, financeType = '', actorRole = null } = {}) {
  // A manually uploaded file must never advance Sales/Finance. Canonical
  // server completion owns this transition once it is available.
  throw new Error(PHASE0_LEGACY_OTP_SIGNING_DISABLED)

  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  return triggerPostSigningWorkflowIfNeeded(client, {
    transactionId,
    financeType,
    actorUserId: actorProfile.userId || null,
    actorRole: normalizeRoleType(actorRole || actorProfile.role || 'agent'),
    source: 'manual_signed_otp_upload',
  })
}

export async function finalizeCanonicalPhysicalSignedOtpWorkflow({ transactionId, financeType = '', actorRole = null } = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  return triggerPostSigningWorkflowIfNeeded(client, {
    transactionId,
    financeType,
    actorUserId: actorProfile.userId || null,
    actorRole: normalizeRoleType(actorRole || actorProfile.role || 'agent'),
    source: 'canonical_physical_signed_otp_upload',
  })
}

export async function fetchClientOtpSigningByToken(token) {
  // The old token route rendered a client-side signing session outside the
  // canonical packet pipeline.
  throw new Error(PHASE0_LEGACY_OTP_SIGNING_DISABLED)

  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  const transactionPromise = (async () => {
    let transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, development_id, unit_id, transaction_reference, stage')
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (
      transactionQuery.error &&
      (isMissingColumnError(transactionQuery.error, 'transaction_reference') ||
        isMissingColumnError(transactionQuery.error, 'stage'))
    ) {
      transactionQuery = await client
        .from('transactions')
        .select('id, buyer_id, development_id, unit_id')
        .eq('id', link.transaction_id)
        .maybeSingle()
    }

    return transactionQuery
  })()

  const [transactionQuery, unitQuery, buyerQuery] = await Promise.all([
    transactionPromise,
    link.unit_id
      ? client
          .from('units')
          .select('id, unit_number, development:developments(name)')
          .eq('id', link.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    link.buyer_id
      ? client.from('buyers').select('id, name, email').eq('id', link.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (transactionQuery.error) {
    throw transactionQuery.error
  }
  if (unitQuery.error) {
    throw unitQuery.error
  }
  if (buyerQuery.error) {
    throw buyerQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction?.id) {
    throw new Error('Transaction not found.')
  }

  const developmentName = normalizeTextValue(
    Array.isArray(unitQuery.data?.development)
      ? unitQuery.data?.development?.[0]?.name
      : unitQuery.data?.development?.name,
  )
  const unitNumber = normalizeTextValue(unitQuery.data?.unit_number)
  const propertyLabel = [developmentName, unitNumber ? `Unit ${unitNumber}` : ''].filter(Boolean).join(' • ')
  const signedOtpDocument = await resolveLatestSignedOtpDocumentForTransaction(client, transaction.id)
  if (signedOtpDocument?.id && signedOtpDocument?.file_path) {
    const signedUrl = await createClientPortalDocumentSignedUrl({
      token,
      filePath: signedOtpDocument.file_path,
      expiresInSeconds: 5 * 60,
    })
    const signedAt = signedOtpDocument.created_at || new Date().toISOString()
    const signingSession = buildCanonicalSigningSession({
      document: {
        id: signedOtpDocument.id,
        type: 'otp',
        title: normalizeTextValue(signedOtpDocument.name || 'Signed Offer to Purchase (OTP)'),
        transactionId: transaction.id,
        transactionReference: normalizeTextValue(transaction.transaction_reference),
        propertyLabel,
      },
      version: {
        id: signedOtpDocument.id,
        number: 1,
        status: 'finalised',
        documentId: signedOtpDocument.id,
        fileName: signedOtpDocument.name,
        pdfPath: signedOtpDocument.file_path,
        pdfUrl: signedUrl,
      },
      signer: {
        id: buyerQuery.data?.id || null,
        name: normalizeTextValue(buyerQuery.data?.name || 'Client'),
        email: normalizeEmailAddress(buyerQuery.data?.email),
        role: 'purchaser_1',
        status: 'signed',
        signedAt,
      },
      fields: [{
        id: `legacy-otp-signature-${signedOtpDocument.id}`,
        signerRole: 'purchaser_1',
        type: 'signature',
        pageNumber: 1,
        x: 72,
        y: 700,
        width: 180,
        height: 48,
        required: true,
        status: 'completed',
        completedAt: signedAt,
      }],
      signingOrder: [{ signerId: buyerQuery.data?.id || null, role: 'purchaser_1', order: 1, status: 'signed' }],
      session: { status: 'completed' },
      binding: {
        documentId: signedOtpDocument.id,
        versionId: signedOtpDocument.id,
        pdfPath: signedOtpDocument.file_path,
        bindingKey: `signed-otp-document:${signedOtpDocument.id}:${signedOtpDocument.file_path}`,
        exactVersionBound: true,
      },
    })
    const completion = buildSigningCompletion({
      completedAt: signedAt,
      document: signingSession.document,
      version: { ...signingSession.version, finalisedAt: signedAt },
      signer: signingSession.signer,
      finalArtifact: {
        documentId: signedOtpDocument.id,
        fileName: signedOtpDocument.name,
        path: signedOtpDocument.file_path,
        url: signedUrl,
      },
      transactionSaved: true,
      access: {
        transactionVisible: true,
        clientVisible: true,
        canonicalSatisfied: true,
        portalSurface: 'client_portal',
        verifiedAt: signedAt,
      },
      delivery: { status: 'available', emailStatus: 'not_confirmed' },
    })
    return {
      signingSession,
      completion,
      token,
      transaction: { id: transaction.id, transactionReference: transaction.transaction_reference, stage: transaction.stage },
      buyer: { id: buyerQuery.data?.id || null, name: signingSession.signer.name, email: signingSession.signer.email },
      property: { developmentName, unitNumber, unitLabel: unitNumber ? `Unit ${unitNumber}` : '' },
      otpDocument: {
        id: signedOtpDocument.id,
        name: signedOtpDocument.name,
        filePath: signedOtpDocument.file_path,
        previewUrl: signedUrl,
        uploadedAt: signedAt,
      },
    }
  }

  const otpDocument = await resolveLatestOtpDocumentForTransaction(client, transaction.id)
  if (!otpDocument?.id || !otpDocument?.file_path) {
    throw new Error('No OTP document is available for signature yet.')
  }

  const signedUrl = await createClientPortalDocumentSignedUrl({
    token,
    filePath: otpDocument.file_path,
    expiresInSeconds: 5 * 60,
  })

  const signingSession = buildCanonicalSigningSession({
    document: {
      id: otpDocument.id,
      type: 'otp',
      title: normalizeTextValue(otpDocument.name || 'Offer to Purchase (OTP)'),
      transactionId: transaction.id,
      transactionReference: normalizeTextValue(transaction.transaction_reference),
      propertyLabel,
    },
    version: {
      id: otpDocument.id,
      number: 1,
      status: 'generated',
      documentId: otpDocument.id,
      fileName: normalizeTextValue(otpDocument.name || 'Offer to Purchase (OTP)'),
      pdfPath: otpDocument.file_path,
      pdfUrl: signedUrl,
    },
    signer: {
      id: buyerQuery.data?.id || null,
      name: normalizeTextValue(buyerQuery.data?.name || 'Client'),
      email: normalizeEmailAddress(buyerQuery.data?.email),
      role: 'purchaser_1',
      order: 1,
      status: 'sent',
      expiresAt: link.expires_at || link.expiresAt || null,
    },
    fields: [{
      id: `legacy-otp-signature-${otpDocument.id}`,
      signerRole: 'purchaser_1',
      type: 'signature',
      pageNumber: 1,
      x: 72,
      y: 700,
      width: 180,
      height: 48,
      required: true,
      status: 'pending',
    }],
    signingOrder: [{
      signerId: buyerQuery.data?.id || null,
      role: 'purchaser_1',
      order: 1,
      status: 'sent',
    }],
    session: {
      status: 'sent',
      expiresAt: link.expires_at || link.expiresAt || null,
    },
    binding: {
      documentId: otpDocument.id,
      versionId: otpDocument.id,
      pdfPath: otpDocument.file_path,
      bindingKey: `otp-document:${otpDocument.id}:${otpDocument.file_path}`,
      exactVersionBound: true,
      certified: false,
    },
  })

  return {
    signingSession,
    token,
    transaction: {
      id: transaction.id,
      transactionReference: normalizeTextValue(transaction.transaction_reference),
      stage: normalizeTextValue(transaction.stage),
    },
    buyer: {
      id: buyerQuery.data?.id || null,
      name: normalizeTextValue(buyerQuery.data?.name || 'Client'),
      email: normalizeEmailAddress(buyerQuery.data?.email),
    },
    property: {
      developmentName,
      unitNumber,
      unitLabel: unitNumber ? `Unit ${unitNumber}` : '',
    },
    otpDocument: {
      id: otpDocument.id,
      name: normalizeTextValue(otpDocument.name || 'Offer to Purchase (OTP)'),
      filePath: otpDocument.file_path,
      previewUrl: signedUrl,
      uploadedAt: otpDocument.created_at || null,
    },
  }
}

export async function submitClientOtpSignature({
  token,
  otpDocumentId = null,
  signatureDataUrl,
  confirmationAccepted = false,
  signatureName = '',
} = {}) {
  // The old route wrote a synthetic PDF, marked it final, and advanced the
  // transaction from the browser. Keep the public API fail-closed.
  throw new Error(PHASE0_LEGACY_OTP_SIGNING_DISABLED)

  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)

  if (!link?.transaction_id) {
    throw new Error('Client portal link is missing a transaction.')
  }

  if (!confirmationAccepted) {
    throw new Error('Please confirm that you have reviewed and agree before submitting.')
  }

  const normalizedSignatureDataUrl = String(signatureDataUrl || '').trim()
  if (!normalizedSignatureDataUrl) {
    throw new Error('A signature is required before submitting.')
  }

  const resolvedSignatureName = normalizeTextValue(signatureName || 'Client')
  const nowIso = new Date().toISOString()
  const timestamp = Date.now()
  const signatureFile = decodeDataUrlToFile(normalizedSignatureDataUrl, `otp-signature-${timestamp}.png`)
  const signatureFilePath = `client-portal/${link.transaction_id}/otp-signature-${timestamp}.png`
  await uploadToDocumentsBucket(client, signatureFilePath, signatureFile)

  const signatureDocumentPayload = {
    transaction_id: link.transaction_id,
    name: signatureFile.name,
    file_path: signatureFilePath,
    category: 'Signed OTP',
    document_type: 'otp_signature',
    visibility_scope: 'shared',
    uploaded_by_user_id: null,
    stage_key: 'otp_prep_signing',
    is_client_visible: false,
    uploaded_by_role: 'client',
    uploaded_by_email: null,
  }

  let signatureInsert = await client
    .from('documents')
    .insert(signatureDocumentPayload)
    .select('id, transaction_id, name, file_path, category, document_type, created_at')
    .single()

  if (
    signatureInsert.error &&
    (isMissingColumnError(signatureInsert.error, 'document_type') ||
      isMissingColumnError(signatureInsert.error, 'visibility_scope') ||
      isMissingColumnError(signatureInsert.error, 'stage_key') ||
      isMissingColumnError(signatureInsert.error, 'uploaded_by_user_id') ||
      isMissingColumnError(signatureInsert.error, 'is_client_visible') ||
      isMissingColumnError(signatureInsert.error, 'uploaded_by_role') ||
      isMissingColumnError(signatureInsert.error, 'uploaded_by_email'))
  ) {
    signatureInsert = await client
      .from('documents')
      .insert({
        transaction_id: link.transaction_id,
        name: signatureFile.name,
        file_path: signatureFilePath,
        category: 'Signed OTP',
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (signatureInsert.error) {
    throw signatureInsert.error
  }

  let targetOtpDocumentId = normalizeNullableText(otpDocumentId)
  if (!targetOtpDocumentId) {
    const latestOtpDocument = await resolveLatestOtpDocumentForTransaction(client, link.transaction_id)
    targetOtpDocumentId = normalizeNullableText(latestOtpDocument?.id)
  }

  if (!targetOtpDocumentId) {
    throw new Error('Unable to locate the OTP document to update its status.')
  }

  const transactionPromise = (async () => {
    let transactionQuery = await client
      .from('transactions')
      .select('id, buyer_id, unit_id, finance_type, transaction_reference')
      .eq('id', link.transaction_id)
      .maybeSingle()

    if (
      transactionQuery.error &&
      (isMissingColumnError(transactionQuery.error, 'finance_type') ||
        isMissingColumnError(transactionQuery.error, 'transaction_reference'))
    ) {
      transactionQuery = await client
        .from('transactions')
        .select('id, buyer_id, unit_id')
        .eq('id', link.transaction_id)
        .maybeSingle()
    }

    return transactionQuery
  })()

  const sourceOtpDocumentPromise = (async () => {
    let sourceOtpDocumentQuery = await client
      .from('documents')
      .select('id, name, file_path, category, document_type')
      .eq('id', targetOtpDocumentId)
      .maybeSingle()

    if (sourceOtpDocumentQuery.error && isMissingColumnError(sourceOtpDocumentQuery.error, 'document_type')) {
      sourceOtpDocumentQuery = await client
        .from('documents')
        .select('id, name, file_path, category')
        .eq('id', targetOtpDocumentId)
        .maybeSingle()
    }

    return sourceOtpDocumentQuery
  })()

  const [transactionQuery, unitQuery, buyerQuery, sourceOtpDocumentQuery] = await Promise.all([
    transactionPromise,
    link.unit_id
      ? client
          .from('units')
          .select('id, unit_number, development:developments(name)')
          .eq('id', link.unit_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    link.buyer_id
      ? client.from('buyers').select('id, name').eq('id', link.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sourceOtpDocumentPromise,
  ])

  if (transactionQuery.error) {
    throw transactionQuery.error
  }
  if (unitQuery.error) {
    throw unitQuery.error
  }
  if (buyerQuery.error) {
    throw buyerQuery.error
  }
  if (sourceOtpDocumentQuery.error) {
    throw sourceOtpDocumentQuery.error
  }

  const transactionRow = transactionQuery.data || null
  const sourceOtpDocument = sourceOtpDocumentQuery.data || null
  const developmentName = normalizeTextValue(
    Array.isArray(unitQuery.data?.development)
      ? unitQuery.data?.development?.[0]?.name
      : unitQuery.data?.development?.name,
  )
  const unitNumber = normalizeTextValue(unitQuery.data?.unit_number)
  const unitLabel = unitNumber ? `Unit ${unitNumber}` : ''
  const buyerName = normalizeTextValue(buyerQuery.data?.name || resolvedSignatureName || 'Client')
  const signedOtpFileName = `${sanitizeFilePart(developmentName, 'development') || 'development'}-${sanitizeFilePart(unitLabel || unitNumber, 'unit') || 'unit'}-${sanitizeFilePart(buyerName, 'buyer') || 'buyer'}-signed-otp-${timestamp}.pdf`
  const signedOtpPdfFile = buildSignedOtpSummaryPdfFile({
    transactionReference: normalizeTextValue(transactionRow?.transaction_reference),
    developmentName,
    unitLabel,
    buyerName,
    signatureName: resolvedSignatureName,
    signedAtIso: nowIso,
    sourceDocumentName: normalizeTextValue(sourceOtpDocument?.name || 'Offer to Purchase (OTP)'),
    sourceDocumentPath: normalizeTextValue(sourceOtpDocument?.file_path || ''),
    fileName: signedOtpFileName,
  })
  const signedOtpPdfPath = `client-portal/${link.transaction_id}/${signedOtpFileName}`
  await uploadToDocumentsBucket(client, signedOtpPdfPath, signedOtpPdfFile, {
    upsert: false,
    contentType: 'application/pdf',
  })

  let signedOtpInsert = await client
    .from('documents')
    .insert({
      transaction_id: link.transaction_id,
      name: signedOtpPdfFile.name,
      file_path: signedOtpPdfPath,
      category: 'Offer to Purchase (OTP) · Signed Final',
      document_type: OTP_DOCUMENT_TYPES.signedFinal,
      visibility_scope: 'shared',
      uploaded_by_user_id: null,
      stage_key: 'otp_prep_signing',
      is_client_visible: true,
      uploaded_by_role: 'client',
      uploaded_by_email: null,
    })
    .select('id, transaction_id, name, file_path, category, document_type, created_at')
    .single()

  if (
    signedOtpInsert.error &&
    (isMissingColumnError(signedOtpInsert.error, 'document_type') ||
      isMissingColumnError(signedOtpInsert.error, 'visibility_scope') ||
      isMissingColumnError(signedOtpInsert.error, 'stage_key') ||
      isMissingColumnError(signedOtpInsert.error, 'uploaded_by_user_id') ||
      isMissingColumnError(signedOtpInsert.error, 'is_client_visible') ||
      isMissingColumnError(signedOtpInsert.error, 'uploaded_by_role') ||
      isMissingColumnError(signedOtpInsert.error, 'uploaded_by_email'))
  ) {
    signedOtpInsert = await client
      .from('documents')
      .insert({
        transaction_id: link.transaction_id,
        name: signedOtpPdfFile.name,
        file_path: signedOtpPdfPath,
        category: 'Signed OTP',
      })
      .select('id, transaction_id, name, file_path, category, created_at')
      .single()
  }

  if (signedOtpInsert.error) {
    throw signedOtpInsert.error
  }

  const signedOtpPdfUrl = await createClientPortalDocumentSignedUrl({
    token,
    filePath: signedOtpPdfPath,
    expiresInSeconds: 5 * 60,
  })

  const updatedOtpDocument = await updateOtpDocumentWorkflowState({
    documentId: targetOtpDocumentId,
    workflowState: OTP_DOCUMENT_TYPES.signedFinal,
    isClientVisible: true,
    clientOverride: client,
  })

  await runDocumentAutomationIfPossible(client, {
    transactionId: link.transaction_id,
    documentId: signedOtpInsert.data?.id || null,
    documentName: signedOtpInsert.data?.name || signedOtpPdfFile.name,
    documentType: 'signed_otp',
    category: signedOtpInsert.data?.category || 'Offer to Purchase (OTP) · Signed Final',
    actorRole: 'client',
    actorUserId: null,
    source: 'client_otp_signed_final',
    requiredDocumentKey: 'signed_otp',
  })

  let workflowTriggerResult = null
  try {
    workflowTriggerResult = await triggerPostSigningWorkflowIfNeeded(client, {
      transactionId: link.transaction_id,
      financeType: normalizeTextValue(transactionRow?.finance_type || ''),
      actorUserId: null,
    })
  } catch (workflowTriggerError) {
    console.warn('Post-signing workflow trigger failed', {
      transactionId: link.transaction_id,
      error: workflowTriggerError,
    })
  }

  await logTransactionEventIfPossible(client, {
    transactionId: link.transaction_id,
    eventType: 'TransactionUpdated',
    createdByRole: 'client',
    eventData: {
      source: 'client_otp_signing',
      action: 'otp_signed_by_client',
      otpDocumentId: targetOtpDocumentId,
      signatureDocumentId: signatureInsert.data?.id || null,
      signedOtpPdfDocumentId: signedOtpInsert.data?.id || null,
      signatureName: resolvedSignatureName,
      signedAt: nowIso,
      workflowTriggered: Boolean(workflowTriggerResult?.triggered),
      workflowType: workflowTriggerResult?.workflow || null,
    },
  })

  await addTransactionDiscussionComment({
    transactionId: link.transaction_id,
    unitId: link.unit_id || null,
    authorName: resolvedSignatureName || 'Client',
    authorRole: 'client',
    commentText: '[system] OTP signature submitted by client.',
    client,
  })

  const completion = buildSigningCompletion({
    completedAt: nowIso,
    document: {
      id: targetOtpDocumentId,
      type: 'otp',
      title: normalizeTextValue(sourceOtpDocument?.name || 'Offer to Purchase (OTP)'),
      transactionId: link.transaction_id,
      transactionReference: normalizeTextValue(transactionRow?.transaction_reference),
      propertyLabel: [developmentName, unitLabel].filter(Boolean).join(' • '),
    },
    version: { id: targetOtpDocumentId, number: 1, finalisedAt: nowIso },
    signer: { name: resolvedSignatureName, role: 'purchaser_1', signedAt: nowIso },
    finalArtifact: {
      documentId: signedOtpInsert.data?.id || null,
      fileName: signedOtpInsert.data?.name || signedOtpPdfFile.name,
      path: signedOtpPdfPath,
      url: signedOtpPdfUrl,
    },
    transactionSaved: true,
    access: {
      transactionVisible: true,
      clientVisible: true,
      canonicalSatisfied: true,
      portalSurface: 'client_portal',
      verifiedAt: nowIso,
    },
    delivery: { status: 'available', emailStatus: 'not_confirmed' },
  })

  return {
    ok: true,
    transactionId: link.transaction_id,
    otpDocument: updatedOtpDocument,
    signatureDocument: signatureInsert.data || null,
    signedOtpPdfDocument: signedOtpInsert.data || null,
    workflowTriggerResult,
    signedAt: nowIso,
    completion,
  }
}
