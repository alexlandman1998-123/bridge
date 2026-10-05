/* eslint-disable react-refresh/only-export-components -- Standalone acceptance entry without HMR. */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import SellerDocumentSigning from '../../src/pages/SellerDocumentSigning.jsx'
import SellerDocumentReviewActions from '../../src/components/documents/SellerDocumentReviewActions.jsx'

// Only the local staff transport is synthetic. The public signing page,
// review component, public service, Edge handler and review SQL are real.
function PhysicalReview() {
  const { documentId } = useParams()
  const [document, setDocument] = useState(null)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState('')
  useEffect(() => {
    let active = true
    fetch(`/api/physical-review?id=${encodeURIComponent(documentId)}`).then(response => response.json()).then(value => {
      if (active) setDocument(value.document)
    })
    return () => { active = false }
  }, [documentId])
  const review = async ({ action, reason }) => {
    setBusy(`${document.document_type}:${action}`)
    try {
      const response = await fetch('/api/physical-review', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId, action, reason, expectedVersion: document.review_revision || 0 }) })
      const value = await response.json()
      if (!response.ok) { setResult(value.error); return false }
      setDocument(value.document)
      setResult('Signed copy approved')
      return true
    } finally { setBusy('') }
  }
  return <main className="mx-auto max-w-2xl p-4">
    <h1>Local physical document review</h1>
    {document ? <SellerDocumentReviewActions item={{ key: document.document_type, status: document.status, linkedDocument: document }}
      busyAction={busy} onReview={review} requireSignedCopyCheck /> : null}
    {result ? <p role="status">{result}</p> : null}
  </main>
}

createRoot(document.getElementById('root')).render(<BrowserRouter><Routes>
  <Route path="/seller/sign/:token" element={<SellerDocumentSigning />} />
  <Route path="/review/:documentId" element={<PhysicalReview />} />
</Routes></BrowserRouter>)
