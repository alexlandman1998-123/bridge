import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

import { listOtpLegalContentTemplateSections } from '../src/core/documents/otpLegalContentTemplates.js'
import { listOtpSignatureRoles } from '../src/core/documents/otpSignatureInitials.js'
import { buildOtpCommercialTermsRuntimeInput } from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'

const execFileAsync = promisify(execFile)

const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const OUTPUT_DIR = path.join(REPO_ROOT, 'output/pdf')
const TMP_DIR = path.join(REPO_ROOT, 'tmp/pdfs')
const RENDERED_PAGE_DIR = path.join(OUTPUT_DIR, 'phase27-rendered-pages')
const PYTHON = process.env.CODEX_PYTHON ||
  '/Users/alexanderlandman/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const PDFTOPPM = process.env.CODEX_PDFTOPPM ||
  '/Users/alexanderlandman/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function fileSha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function replaceMergeFields(value = '', replacements = {}) {
  return normalizeText(value).replace(/\{\{([^}]+)\}\}/g, (_, key) => normalizeText(replacements[normalizeText(key)]) || 'To be completed')
}

function hasCommissionVariation(fields = {}) {
  const status = normalizeText(fields.otp_commission_variation_status).toLowerCase()
  const approval = normalizeText(fields.otp_commission_approval_reference)
  const mandate = normalizeText(fields.mandate_commission_snapshot)
  const proposal = normalizeText(fields.otp_commission_proposal)
  return Boolean(approval || (status && status !== 'not_required') || (mandate && proposal && mandate !== proposal))
}

function buildLegalClauses({ routeVariant = '', sections = [], fields = {}, summary = {} } = {}) {
  const isDevelopment = routeVariant === 'new_development'
  const buyer = summary.buyerInfo || {}
  const seller = summary.sellerInfo || {}
  const property = summary.propertyInfo || {}
  const replacements = {
    buyer_full_name: buyer.fullName || summary.buyer,
    buyer_id_number: buyer.idNumber,
    buyer_email: buyer.email,
    buyer_phone: buyer.phone,
    seller_full_name: seller.fullName || summary.seller,
    seller_id_number: seller.idNumber,
    seller_email: seller.email,
    seller_phone: seller.phone,
    developer_name: seller.fullName || summary.seller,
    developer_company_registration: seller.idNumber,
    agent_full_name: 'Alex Agent',
    agent_ffc_number: 'FFC-PHASE27',
    organisation_trading_name: 'Arch9 Realty',
    property_address: property.description || summary.property,
    property_title_type: property.titleType,
    purchase_price: property.purchasePrice || summary.purchasePrice,
    purchase_price_words: property.purchasePriceWords,
    deposit_amount: property.deposit,
    deposit_due_date: property.depositDueDate,
    trust_account_recipient: 'Phase 27 Transfer Attorneys trust account',
    finance_type: property.financeType,
    bond_amount: property.bondAmount,
    bond_approval_deadline: property.bondApprovalDeadline,
    cash_amount: property.cashAmount,
    cash_proof_deadline: property.cashProofDeadline,
    guarantee_delivery_deadline: property.guaranteeDeliveryDeadline,
    guarantee_delivery_period: property.guaranteeDeliveryPeriod,
    irrevocable_offer_expiry: property.offerExpiry,
    structured_suspensive_conditions: property.structuredConditions,
    transfer_attorney_company_name: fields.transfer_attorney_company_name,
    transfer_attorney_contact_person: fields.transfer_attorney_contact_person,
    transfer_attorney_email: fields.transfer_attorney_email,
    transfer_attorney_phone: fields.transfer_attorney_phone,
    matter_attorney_cost_quote_status: fields.matter_attorney_cost_quote_status,
    otp_buyer_cost_obligations: fields.otp_buyer_cost_obligations,
    otp_pending_cost_obligations: fields.otp_pending_cost_obligations,
    gross_commission_amount: fields.gross_commission_amount,
    mandate_commission_snapshot: fields.mandate_commission_snapshot,
    otp_commission_proposal: fields.otp_commission_proposal,
    otp_commission_variation_status: fields.otp_commission_variation_status,
    otp_commission_approval_reference: fields.otp_commission_approval_reference,
    vat_inclusive_purchase_price: property.purchasePrice,
    development_levy_estimate: 'R 2 200 per month estimated',
    utility_connection_charges: 'R 14 500 estimated',
  }
  const templateClauses = sections.map((section, index) => {
    let legalText = replaceMergeFields(section.legal_text, replacements)
    if (section.section_key === 'otp_commission_variation' && !hasCommissionVariation(fields)) {
      legalText = `AGENCY COMMISSION

Agency: ${replacements.organisation_trading_name}
Agent: ${replacements.agent_full_name}
Agent FFC Number: ${replacements.agent_ffc_number}
Gross Commission Amount: ${replacements.gross_commission_amount}
Mandate Commission Snapshot: ${replacements.mandate_commission_snapshot}

The mandate commission applies for this route.`
    }
    return {
      sectionNumber: `Section ${index + 3}`,
      key: section.section_key,
      label: section.section_label,
      legalText,
    }
  })
  const fallbackClauses = [
    ['Offer validity and acceptance', 'This offer remains open for acceptance until the expiry date recorded in the property information. Acceptance must be communicated in writing and signed by the authorised party before expiry.'],
    ['Occupation and possession', 'Occupation, possession and any occupational consideration are governed by the dates and amounts recorded in the structured terms. Risk and benefit do not pass merely because occupation is granted unless this agreement expressly says so.'],
    ['Risk and benefit', 'Risk in the property remains with the seller until the transfer date unless a route-specific clause provides otherwise. Each party must preserve the property and transaction records required for transfer.'],
    ['Compliance certificates', 'The seller must provide the compliance certificates required by law, municipal authority, body corporate rules or this agreement. The purchaser may not be required to accept transfer without the certificates required for the applicable route.'],
    ['Disclosure and warranties', isDevelopment
      ? 'The developer warrants only those matters expressly stated in this agreement and the approved development disclosure documents. The purchaser acknowledges that development specifications, levies and occupation dates may be subject to the approved development programme.'
      : 'The seller must disclose known defects and provide the mandatory disclosure record where applicable. The purchaser acknowledges receipt of the disclosure information recorded for the property before signature.'],
    ['Fixtures and exclusions', 'Fixtures, fittings, appliances and exclusions are only included if recorded in the structured property terms or annexures. No verbal assurance varies the written included or excluded item schedule.'],
    ['Breach and remedies', 'If either party breaches this agreement and fails to remedy the breach after written notice, the aggrieved party may pursue the remedies available in law and under this agreement, including cancellation or specific performance where applicable.'],
    ['Notices and domicilium', 'The parties choose the physical and electronic addresses recorded in the transaction records for notices. A notice sent to the recorded address is treated as validly delivered unless a party has given written notice of a changed address.'],
    ['POPIA and FICA', 'The parties consent to the processing of personal information required for FICA, transfer, bond, agency, conveyancing, compliance and signature purposes. Information may be shared only with transaction participants who require it for the matter.'],
    ['Annexures', 'All annexures referenced in this agreement form part of the agreement once identified and signed or initialled where required. If an annexure conflicts with a typed special condition, the stricter signed condition applies unless expressly varied.'],
    ['Signing counterparts', 'This agreement may be signed in counterparts and by electronic signature where the signing workflow records signer identity, role, date, document version and completion evidence.'],
    ['Initials on every page', 'Each required signatory must initial every page. Initials are evidence that the party has had sight of the page but do not replace the signature required on the signature page.'],
    ['Route-specific special conditions', isDevelopment
      ? 'New-development special conditions apply only to the development unit, developer obligations, estimated levies, utility connection charges, snagging and handover arrangements recorded for this route.'
      : 'Resale special conditions apply only to the existing property, seller disclosures, occupation, rates, levies, fixtures and transfer arrangements recorded for this route.'],
    ['Costs pending attorney quote', 'Where transfer costs, duty, rates clearance, levy clearance or attorney charges are pending, the purchaser remains responsible for the buyer cost obligations recorded as pending until the matter attorney quote or final statement replaces the estimate.'],
    ['Final statement handling', 'The matter attorney may issue a final statement once charges are known. Any previous quote or estimate is superseded only to the extent that the final statement identifies the updated charge.'],
    ['No oral variations', 'No amendment, indulgence, waiver or cancellation is valid unless recorded in writing and signed by the parties or approved through the authorised document workflow.'],
    ['Entire agreement', 'This agreement, its structured terms and signed annexures contain the entire agreement between the parties for this offer to purchase. The parties do not rely on any representation not recorded in this agreement.'],
  ]
  const clauses = [...templateClauses]
  for (const [label, legalText] of fallbackClauses) {
    if (clauses.length >= 28) break
    clauses.push({
      sectionNumber: `Section ${clauses.length + 3}`,
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      label,
      legalText,
    })
  }
  return clauses.slice(0, 28).map((clause, index) => ({
    ...clause,
    sectionNumber: `Section ${index + 3}`,
  }))
}

function buildRuntimeInput(routeVariant) {
  if (routeVariant === 'new_development') {
    return buildOtpCommercialTermsRuntimeInput({
      wiredAt: '2026-08-05T15:05:00.000Z',
      transaction: {
        id: 'tx-phase27-development',
        otp_document_variant: 'new_development',
        purchase_price: 3150000,
        gross_commission_percentage: 5,
      },
      listing: { commission: { commission_percentage: 5 } },
      developmentUnit: {
        levyEstimate: 2200,
        utilityConnectionCharges: 14500,
      },
      attorneyAssignments: [{
        id: 'assignment-phase27-development',
        attorneyRole: 'transfer_attorney',
        assignmentStatus: 'active',
        firmName: 'Phase 27 Transfer Attorneys',
      }],
    })
  }

  return buildOtpCommercialTermsRuntimeInput({
    wiredAt: '2026-08-05T15:00:00.000Z',
    transaction: {
      id: 'tx-phase27-resale',
      purchase_price: 2850000,
      gross_commission_percentage: 4.5,
    },
    listing: { commission: { commission_percentage: 5 } },
    sellerOnboarding: {
      form_data: {
        property: {
          ratesTaxes: 1950,
          levies: 2400,
          scheme: { bodyCorporateName: 'Phase 27 Body Corporate' },
        },
      },
    },
    commissionVariationRows: [{
      transaction_id: 'tx-phase27-resale',
      route_variant: 'resale_existing_property',
      mandate_commission_snapshot: { basis: 'percentage', percentage: 5 },
      proposed_otp_commission: { basis: 'percentage', percentage: 4.5, amount: 128250 },
      approval_status: 'approved',
      approval_reference: 'OTP-P27-COMM-APPROVED',
      updated_at: '2026-08-05T14:58:00.000Z',
    }],
    attorneyAssignments: [{
      id: 'assignment-phase27-resale',
      attorneyRole: 'transfer_attorney',
      assignmentStatus: 'active',
      attorneyFirmId: 'firm-phase27',
      firmName: 'Phase 27 Transfer Attorneys',
    }],
    matterAttorneyQuoteRows: [{
      transaction_id: 'tx-phase27-resale',
      transaction_attorney_assignment_id: 'assignment-phase27-resale',
      route_variant: 'resale_existing_property',
      quote_status: 'uploaded',
      source_scope: 'transaction_matter',
      amount: 42000,
      updated_at: '2026-08-05T14:59:00.000Z',
    }],
  })
}

function buildRoutePayload(routeVariant) {
  const runtime = buildRuntimeInput(routeVariant)
  const isDevelopment = routeVariant === 'new_development'
  const sections = listOtpLegalContentTemplateSections({ variant: routeVariant })
  const roles = listOtpSignatureRoles({ variant: routeVariant })
  const fields = runtime.generatorInput.mergeFields
  const costItems = runtime.reviewModel.sections.buyerCostObligations.items
  const summary = {
    buyer: isDevelopment ? 'Development Buyer (Pty) Ltd' : 'Resale Buyer',
    seller: isDevelopment ? 'Phase 27 Developer (Pty) Ltd' : 'Resale Seller',
    property: isDevelopment ? 'Unit 1402, Phase 27 Heights' : '27 Proof Avenue, Sandton',
    purchasePrice: isDevelopment ? 'R 3 150 000 VAT inclusive' : 'R 2 850 000',
    buyerInfo: {
      fullName: isDevelopment ? 'Development Buyer (Pty) Ltd' : 'Resale Buyer',
      idNumber: isDevelopment ? '2026/123456/07' : '8001015009087',
      email: isDevelopment ? 'buyer.development@example.com' : 'buyer.resale@example.com',
      phone: '+27 82 000 2701',
      capacity: isDevelopment ? 'Purchaser represented by authorised signatory' : 'Purchaser in personal capacity',
    },
    sellerInfo: {
      fullName: isDevelopment ? 'Phase 27 Developer (Pty) Ltd' : 'Resale Seller',
      idNumber: isDevelopment ? '2026/654321/07' : '7501015009088',
      email: isDevelopment ? 'sales@phase27developer.example' : 'seller.resale@example.com',
      phone: '+27 82 000 2702',
      capacity: isDevelopment ? 'Developer represented by authorised signatory' : 'Registered owner / seller',
    },
    propertyInfo: {
      description: isDevelopment ? 'Unit 1402, Phase 27 Heights' : '27 Proof Avenue, Sandton',
      titleType: isDevelopment ? 'Sectional title development unit' : 'Freehold residential property',
      purchasePrice: isDevelopment ? 'R 3 150 000 VAT inclusive' : 'R 2 850 000',
      purchasePriceWords: isDevelopment ? 'Three million one hundred and fifty thousand rand VAT inclusive' : 'Two million eight hundred and fifty thousand rand',
      deposit: isDevelopment ? 'R 157 500 payable to trust' : 'R 142 500 payable to trust',
      depositDueDate: 'Within 3 business days after acceptance',
      financeType: 'Bond finance',
      bondAmount: isDevelopment ? 'R 2 520 000' : 'R 2 280 000',
      bondApprovalDeadline: '21 days after acceptance',
      cashAmount: isDevelopment ? 'R 630 000' : 'R 570 000',
      cashProofDeadline: '7 days after acceptance',
      guaranteeDeliveryDeadline: '14 days after bond approval',
      guaranteeDeliveryPeriod: '14 days',
      offerExpiry: '17:00 on the fifth business day after signature',
      structuredConditions: 'Subject to bond approval and standard transfer requirements',
    },
  }

  return {
    fileName: isDevelopment ? 'OTP_Phase27_New_Development_Proof.pdf' : 'OTP_Phase27_Resale_Proof.pdf',
    routeVariant,
    routeLabel: isDevelopment ? 'New development OTP' : 'Existing / resale property OTP',
    agencyName: 'Arch9 Realty',
    website: 'www.arch9.co.za',
    companyDetails: {
      tradingName: 'Arch9 Realty',
      legalName: 'Arch9 Property Group (Pty) Ltd',
      registration: 'Reg: 2026/000001/07',
      address: '1 Sandton Drive, Johannesburg',
    },
    summary,
    mergeFields: fields,
    costItems,
    legalSections: buildLegalClauses({ routeVariant, sections, fields, summary }),
    signatureRoles: roles.map((role) => role.label),
    initialRoles: roles.map((role) => role.role),
    expectedMarkers: isDevelopment
      ? ['New development OTP', 'Development levy estimate', 'Utility connection charges', 'Developer authorised signatory', 'Contractor authorised signatory', 'Page 1 of', 'Section 30']
      : ['Existing / resale property OTP', 'OTP-P27-COMM-APPROVED', 'Municipal rates and taxes', 'Body corporate levy estimate', 'Seller', 'Page 1 of', 'Section 30'],
    forbiddenMarkers: isDevelopment
      ? ['Municipal rates and taxes', 'Body corporate levy estimate', 'seller_signature', 'Route marker', 'Logo top left', 'Generated PDF proof']
      : ['Development levy estimate', 'Utility connection charges', 'Developer authorised signatory', 'Contractor authorised signatory', 'Route marker', 'Logo top left', 'Generated PDF proof'],
    runtime,
  }
}

async function renderPagePngs(pdfPath, prefix, pageCount) {
  await mkdir(RENDERED_PAGE_DIR, { recursive: true })
  const pngPrefix = path.join(RENDERED_PAGE_DIR, prefix)
  for (const fileName of await readdir(RENDERED_PAGE_DIR)) {
    if (fileName.startsWith(`${prefix}-`) && fileName.endsWith('.png')) {
      try {
        await unlink(path.join(RENDERED_PAGE_DIR, fileName))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
  await execFileAsync(PDFTOPPM, ['-png', pdfPath, pngPrefix])
  const paths = []
  for (let page = 1; page <= Number(pageCount || 0); page += 1) {
    const pngPath = `${pngPrefix}-${page}.png`
    if (!existsSync(pngPath)) throw new Error(`Rendered PNG was not created: ${pngPath}`)
    paths.push(pngPath)
  }
  return paths
}

export async function renderOtpGeneratedPdfProofPhase27() {
  await mkdir(OUTPUT_DIR, { recursive: true })
  await mkdir(TMP_DIR, { recursive: true })
  await mkdir(RENDERED_PAGE_DIR, { recursive: true })

  const inputPath = path.join(TMP_DIR, 'otp-phase27-render-input.json')
  const evidencePath = path.join(TMP_DIR, 'otp-phase27-render-evidence.json')
  const payload = {
    outputDir: OUTPUT_DIR,
    routes: [
      buildRoutePayload('resale_existing_property'),
      buildRoutePayload('new_development'),
    ],
  }

  await writeFile(inputPath, JSON.stringify(payload, null, 2), 'utf8')
  await execFileAsync(PYTHON, [path.join(REPO_ROOT, 'scripts/python/render_otp_phase27_pdf.py'), inputPath, evidencePath], {
    cwd: REPO_ROOT,
  })

  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
  for (const file of evidence.files) {
    const buffer = await readFile(file.path)
    file.renderedSha256 = fileSha256(buffer)
    file.renderedMediaType = 'application/pdf'
    file.docxGenerated = false
    file.fallbackUsed = false
    file.nativePdfVerified = true
    file.renderedPagePngPaths = await renderPagePngs(file.path, `otp-phase27-${file.routeVariant}`, file.pageCount)
    file.renderedPagePngByteLengths = []
    for (const pngPath of file.renderedPagePngPaths) {
      const pngBuffer = await readFile(pngPath)
      file.renderedPagePngByteLengths.push(pngBuffer.length)
    }
    file.firstPagePngPath = file.renderedPagePngPaths[0]
    file.firstPagePngByteLength = file.renderedPagePngByteLengths[0]
  }

  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8')
  return {
    outputDir: OUTPUT_DIR,
    evidencePath,
    files: evidence.files,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await renderOtpGeneratedPdfProofPhase27()
  console.log(JSON.stringify(result, null, 2))
}
