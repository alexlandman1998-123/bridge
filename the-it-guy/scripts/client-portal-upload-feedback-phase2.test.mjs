import assert from 'node:assert/strict'
import fs from 'node:fs'

const uploadButton = fs.readFileSync('src/components/client-portal/documents/ClientDocumentUploadButton.jsx', 'utf8')
const canonicalArea = fs.readFileSync('src/components/client-portal/documents/canonical/RequirementUploadArea.jsx', 'utf8')
const clientPortal = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')

assert.match(uploadButton, /selectedFile/, 'Uploads should retain the selected file details while feedback is shown.')
assert.match(uploadButton, /formatFileSize/, 'Uploads should show a human-readable selected file size.')
assert.match(uploadButton, /Uploading securely — please keep this page open\./, 'Uploads should give an honest in-progress instruction when percentage progress is unavailable.')
assert.match(uploadButton, /Received and awaiting review by your transaction team\./, 'Uploads should clearly acknowledge receipt and review state.')
assert.match(uploadButton, /Try again/, 'Uploads should offer a clear retry state after an error.')
assert.match(uploadButton, /role="status" aria-live="polite"/, 'Upload feedback should be announced to assistive technology.')
assert.match(uploadButton, /setSubmitting\(true\)/, 'The upload button should prevent duplicate submissions before parent state updates.')
assert.match(uploadButton, /await onUpload\(uploadSpec, file\)/, 'Upload feedback should wait for the actual upload result.')
assert.match(canonicalArea, /ClientDocumentUploadButton/, 'Canonical document requests should use the shared upload-feedback control.')
assert.doesNotMatch(canonicalArea, /type="file"/, 'Canonical document requests should not retain a second upload implementation.')
assert.match(clientPortal, /return \{ ok: true, document: uploaded \}/, 'The portal upload handler should report successful receipt to the shared control.')
assert.match(clientPortal, /return \{ ok: false, error: uploadError\.message/, 'The portal upload handler should report recoverable failures to the shared control.')

console.log('client portal upload feedback phase 2 tests passed')
