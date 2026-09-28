import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { correctSellerDocumentInPortal, signSellerDocumentInPortal, viewSellerDocumentForSignature } from '../services/sellerPortalDocumentSigningService'

const titles = {
  signed_disclosure_form: 'Mandatory Disclosure / Defects Form',
  signed_fica_declaration: 'Seller FICA Declaration',
  signed_mandate: 'Seller Mandate',
}

const fieldLabels = {
  sellerName: 'Seller name', idNumber: 'ID or passport number', residentialAddress: 'Residential address', email: 'Contact email', phone: 'Mobile number', propertyAddress: 'Property address',
  idType: 'ID type', saResident: 'South African resident', incomeTaxNumber: 'Income tax number', maritalStatus: 'Marital status', employer: 'Employer', jobTitle: 'Job title', occupation: 'Main occupation', industryOfBusiness: 'Industry of business', countriesOfTrade: 'Countries of trade', dualUseGoods: 'Dual use goods', armsWeapons: 'Arms or weapons', actingOnBehalfOfAnother: 'Acting for another person', heirInEstate: 'Heir in an estate', sourceOfWealth: 'Source of wealth', sourceOfIncome: 'Source of income or funds', politicallyInfluentialPerson: 'Politically influential person', bankName: 'Bank name', accountName: 'Account name', accountNumber: 'Account number', accountType: 'Account type',
  mandateType: 'Mandate type', askingPrice: 'Asking price', startDate: 'Start date', endDate: 'End date', protectionPeriod: 'Protection period', specialConditions: 'Special conditions', commissionBasis: 'Commission basis', commissionPercentage: 'Commission percentage', commissionAmount: 'Fixed commission amount', vatHandling: 'VAT handling',
  comments: 'Other disclosures or comments', remoteControlsQuantity: 'Number of remote controls',
}

function EditableDetails({ document, data, onChange, onSave, saving, dirty }) {
  const section = document.documentKey === 'signed_fica_declaration' ? 'fica' : document.documentKey === 'signed_mandate' ? 'mandate' : 'disclosure'
  const update = (group, key, value) => onChange({ ...data, [group]: { ...data[group], [key]: value } })
  const inputClass = 'mt-1 w-full rounded-lg border border-[#aaa] bg-white px-3 py-3 text-base text-[#171717]'
  const choices = {
    mandateType: [['sole', 'Exclusive'], ['open', 'Open']],
    commissionBasis: [['percentage', 'Percentage'], ['fixed', 'Fixed amount']],
    vatHandling: [['inclusive', 'VAT inclusive'], ['exclusive', 'VAT exclusive']],
    saResident: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']], dualUseGoods: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']], armsWeapons: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']], actingOnBehalfOfAnother: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']], heirInEstate: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']], politicallyInfluentialPerson: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Unsure']],
  }
  const renderField = (group, key, value) => <label key={`${group}-${key}`} className="block text-sm font-semibold text-[#333]">{fieldLabels[key] || key}{key === 'comments' || key === 'specialConditions'
    ? <textarea rows="3" value={value || ''} onChange={(event) => update(group, key, event.target.value)} className={inputClass} />
    : choices[key] ? <select value={value || ''} onChange={(event) => update(group, key, event.target.value)} className={inputClass}><option value="">Select</option>{choices[key].map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>
    : <input type={key === 'startDate' || key === 'endDate' ? 'date' : 'text'} value={value || ''} onChange={(event) => update(group, key, event.target.value)} className={inputClass} />}</label>
  return <section className="space-y-5 rounded-xl border border-[#ddd] bg-white p-5 sm:p-7">
    <div><h2 className="text-xl font-semibold">Check and correct your details</h2><p className="mt-1 text-sm leading-6 text-[#555]">Your changes go into the document everyone signs. Shared details lock after the first signature.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">{Object.entries(data.common || {}).map(([key, value]) => renderField('common', key, value))}</div>
    {section !== 'disclosure' ? <div className="grid gap-4 border-t border-[#ddd] pt-5 sm:grid-cols-2">{Object.entries(data[section] || {}).map(([key, value]) => renderField(section, key, value))}</div> : <>
      <div className="space-y-4 border-t border-[#ddd] pt-5"><h3 className="font-semibold">Property disclosure questions</h3>{(data.questions || []).map((question) => {
        const response = data.disclosure?.responses?.[question.key] || { answer: '', note: '' }
        const changeResponse = (key, value) => onChange({ ...data, disclosure: { ...data.disclosure, responses: { ...data.disclosure.responses, [question.key]: { ...response, [key]: value } } } })
        return <div key={question.key} className="rounded-lg border border-[#ddd] p-4"><p className="font-medium">{question.number}. {question.label}</p><label className="mt-3 block text-sm font-semibold">Answer<select value={response.answer || ''} onChange={(event) => changeResponse('answer', event.target.value)} className={inputClass}><option value="">Select an answer</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label><label className="mt-3 block text-sm font-semibold">Details<textarea rows="2" value={response.note || ''} onChange={(event) => changeResponse('note', event.target.value)} className={inputClass} /></label></div>
      })}</div>
      <div className="grid gap-4 sm:grid-cols-2">{Object.entries(data.disclosure || {}).filter(([key]) => key !== 'responses').map(([key, value]) => renderField('disclosure', key, value))}</div>
    </>}
    <button type="button" disabled={!dirty || saving} onClick={onSave} className="w-full rounded-lg bg-[#171717] px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{saving ? 'Saving changes…' : 'Save and review changes'}</button>
  </section>
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Screen-only rules: the approved HTML and generated document stay unchanged.
function mobileReviewHtml(html = '') {
  const addition = `<meta name="viewport" content="width=device-width, initial-scale=1" /><style>
  @media screen and (max-width:700px) {
    html,body{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
    .document,.property-disclosure-document{width:100%!important;max-width:100%!important}
    .page,.property-disclosure-page{width:100%!important;max-width:100%!important;height:auto!important;min-height:0!important;overflow:visible!important;margin:0!important;padding:20px 16px 30px!important;break-after:auto!important;page-break-after:auto!important;border-bottom:1px solid #ddd!important}
    .doc-header{min-height:0!important;padding:8px 0 16px!important;flex-wrap:wrap!important}
    .brand-copy{max-width:100%!important}.brand-logo{position:static!important;max-width:100%!important}
    .doc-header h1{font-size:18px!important;line-height:1.3!important;overflow-wrap:anywhere!important}
    .doc-body,.page-body{padding:12px 0!important}
    .seller-grid,.two-col,.property-grid,.terms-grid,.signature-grid,.compliance-section-grid{grid-template-columns:1fr!important}
    .field,.data-row,.question,.compliance-row{grid-template-columns:1fr!important}
    .data-row span,.question>span{border-right:0!important;border-bottom:1px solid #ddd!important}
    .doc-footer{position:static!important;margin-top:24px!important;flex-wrap:wrap!important}
    .property-disclosure-page .doc-header,.property-disclosure-page .doc-title,.property-disclosure-page .doc-body{padding-left:0!important;padding-right:0!important}
    .company-details{max-width:100%!important;justify-items:start!important;text-align:left!important}
    .annexure-table{width:100%!important;table-layout:fixed!important}
    .annexure-table th,.annexure-table td{overflow-wrap:anywhere!important;padding:5px 3px!important;font-size:10px!important}
    .annexure-table .question-cell{width:58%!important}.annexure-table .answer-cell{width:14%!important}
    img{max-width:100%!important;height:auto!important}
  }</style>`
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${addition}</head>`) : `${addition}${html}`
}

function SignaturePad({ value, onChange, signerName }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const strokeDistanceRef = useRef(0)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let active = true
    const paint = () => {
      const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width))
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(170 * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.fillStyle = '#fff'
      context.fillRect(0, 0, width, 170)
      context.strokeStyle = '#171717'
      context.lineWidth = 2.5
      context.lineCap = 'round'
      context.lineJoin = 'round'
      if (value) {
        const image = new Image()
        image.onload = () => { if (active) context.drawImage(image, 0, 0, width, 170) }
        image.src = value
      }
    }
    paint()
    window.addEventListener('resize', paint)
    return () => { active = false; window.removeEventListener('resize', paint) }
  }, [value])
  const point = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const pointerDown = (event) => {
    event.preventDefault()
    const canvas = canvasRef.current
    canvas.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    strokeDistanceRef.current = 0
    lastPointRef.current = point(event)
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
  }
  const pointerMove = (event) => {
    if (!drawingRef.current) return
    event.preventDefault()
    const next = point(event)
    const previous = lastPointRef.current
    strokeDistanceRef.current += Math.hypot(next.x - previous.x, next.y - previous.y)
    const context = canvasRef.current.getContext('2d')
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + next.x) / 2, (previous.y + next.y) / 2)
    context.stroke()
    lastPointRef.current = next
  }
  const pointerUp = (event) => {
    if (!drawingRef.current) return
    canvasRef.current.releasePointerCapture?.(event.pointerId)
    drawingRef.current = false
    lastPointRef.current = null
    if (strokeDistanceRef.current >= 12 || value) onChange(canvasRef.current.toDataURL('image/png'))
  }
  return <div>
    <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Draw your signature</p><p className="text-sm text-[#555]">Use your finger, mouse, or trackpad.</p></div><button type="button" onClick={() => onChange('')} className="rounded-lg border border-[#aaa] px-3 py-2 text-sm font-semibold">Clear</button></div>
    <canvas ref={canvasRef} aria-label={`Signature box for ${signerName}`} className="mt-3 block h-[170px] w-full touch-none rounded-lg border border-[#aaa] bg-white" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
  </div>
}

export default function SellerDocumentSigning() {
  const { token = '' } = useParams()
  const previewRef = useRef(null)
  const previewObserverRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [editData, setEditData] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState('')
  const [signature, setSignature] = useState('')
  const [signedDate, setSignedDate] = useState(localDate)
  const [signedPlace, setSignedPlace] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    viewSellerDocumentForSignature(token)
      .then((value) => { if (active) { setDocument(value); setEditData(value.editData || null); setName(value.signerName || '') } })
      .catch((reason) => { if (active) setError(reason?.message || 'This signing link is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  useEffect(() => () => previewObserverRef.current?.disconnect(), [])

  const reviewHtml = useMemo(() => mobileReviewHtml(document?.reviewedHtml || ''), [document?.reviewedHtml])
  const resizePreview = () => {
    const iframe = previewRef.current
    const body = iframe?.contentDocument?.body
    if (!body) return
    const content = body.querySelector('.document, .property-disclosure-document') || body.firstElementChild || body
    const updateHeight = () => { iframe.style.height = `${Math.max(400, content.getBoundingClientRect().height + 16)}px` }
    previewObserverRef.current?.disconnect()
    previewObserverRef.current = new ResizeObserver(updateHeight)
    previewObserverRef.current.observe(content)
    updateHeight()
  }
  const changeDetails = (value) => { setEditData(value); setDirty(true); setAccepted(false); setSignature('') }
  const saveDetails = async () => {
    if (!document || !dirty || saving) return
    setSaving(true); setError('')
    try {
      const result = await correctSellerDocumentInPortal(token, document.versionDigest, editData)
      setDocument({ ...document, reviewedHtml: result.reviewedHtml, versionDigest: result.versionDigest, signerName: result.signerName || document.signerName })
      setName(result.signerName || document.signerName)
      setEditData(result.editData)
      setDirty(false)
    } catch (reason) { setError(reason?.message || 'Your changes could not be saved.') }
    finally { setSaving(false) }
  }
  const canSign = !dirty && accepted && signature && signedDate && signedPlace.trim() && name.trim().toLowerCase() === String(document?.signerName || '').trim().toLowerCase()
  const submit = async (event) => {
    event.preventDefault()
    if (!document || !canSign || saving) return
    setSaving(true)
    setError('')
    try {
      await signSellerDocumentInPortal(token, { signedName: name.trim(), signatureType: 'drawn', signatureValue: signature, signedDate, signedPlace: signedPlace.trim(), versionDigest: document.versionDigest })
      setComplete(true)
      setDocument(null)
    } catch (reason) {
      setError(reason?.message || 'Your signature could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="min-h-screen bg-[#f5f5f5] px-3 py-6 text-[#171717] sm:px-5 sm:py-10"><div className="mx-auto max-w-3xl space-y-5">
    <header className="rounded-xl border border-[#ddd] bg-white p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#555]">Seller documents</p><h1 className="mt-2 text-2xl font-semibold">{complete ? 'Signature received' : document ? `Review and sign ${titles[document.documentKey] || 'your document'}` : 'Seller document signing'}</h1>{document ? <p className="mt-3 text-sm leading-6 text-[#555]">This private request is for {document.signerName} ({document.signerRole}). Read the reviewed information below before signing.</p> : null}</header>
    {loading ? <p role="status" className="rounded-xl bg-white p-5">Loading your reviewed document…</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-[#999] bg-[#eee] p-5 text-[#171717]">{error}</p> : null}
    {complete ? <p role="status" className="rounded-xl border border-[#ccc] bg-white p-5">Your signature was saved. Your agent will review the document after every required seller has signed.</p> : null}
    {document ? <>{document.canEdit && editData ? <EditableDetails document={document} data={editData} onChange={changeDetails} onSave={saveDetails} saving={saving} dirty={dirty} /> : <p className="rounded-xl border border-[#ddd] bg-white p-5 text-sm text-[#555]">Shared document details are locked because a seller has signed.</p>}<section className="overflow-hidden rounded-xl border border-[#ddd] bg-white"><div className="border-b border-[#ddd] px-5 py-3 text-sm font-semibold">Current document for review</div><iframe ref={previewRef} title={titles[document.documentKey] || 'Reviewed seller document'} srcDoc={reviewHtml} sandbox="allow-same-origin" referrerPolicy="no-referrer" onLoad={resizePreview} className="min-h-[400px] w-full border-0" /></section>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-[#ddd] bg-white p-5 sm:p-7">
        <p className="break-all text-xs text-[#666]">Document version: {document.versionDigest}</p>{dirty ? <p className="text-sm font-semibold">Save your changes before signing.</p> : null}
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1" /><span>I have reviewed this document and sign it as the named seller or authorised representative.</span></label>
        <label className="block text-sm font-semibold">Confirm your full name<input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#aaa] px-4 py-3 font-normal" /></label>
        <SignaturePad value={signature} onChange={setSignature} signerName={document.signerName} />
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Date of signature<input type="date" required value={signedDate} onChange={(event) => setSignedDate(event.target.value)} className="mt-2 w-full rounded-lg border border-[#aaa] px-4 py-3 font-normal" /></label><label className="block text-sm font-semibold">Place of signature<input type="text" required value={signedPlace} onChange={(event) => setSignedPlace(event.target.value)} placeholder="City or town" className="mt-2 w-full rounded-lg border border-[#aaa] px-4 py-3 font-normal" /></label></div>
        <button type="submit" disabled={!canSign || saving} className="w-full rounded-lg bg-[#171717] px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">{saving ? 'Saving signature…' : 'Sign this document'}</button>
      </form></> : null}
  </div></main>
}
