import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { buildBondApplicationDocumentPresentation, buildBondDocumentRows } from '../exports/bondApplicationDocumentPresentation.js'
import { renderBondApplicationPackPdf } from '../exports/bondApplicationPackPdf.js'
import { resolveBondApplicationDeclarations } from '../submission/bondApplicationDeclarations.js'

const person = (role, name) => ({ participantRole: role, participantKey: `${role}:1`, answers: {
  personal: { first_name: name, surname: 'Example', identity_number: 'EXAMPLE - NOT REAL', dependants: 0 },
  contact: { email: 'sample@example.test', phone: '0000000000' },
  address: { street: '1 Example Road', city: 'Cape Town', country: 'South Africa' },
  employment: { occupation_status: 'permanent', employer_name: 'Example Employer', occupation: 'Analyst' },
  expenses: { gross_salary: 65000, net_salary: 48000, groceries: 4500, rent: 0 },
  debts: [{ lender: 'Example Bank', balance: 85000, monthlyRepayment: 2000 }],
  assets: [{ type: 'vehicle', description: 'Example hatchback', estimatedValue: 180000 }, { type: 'savings', description: 'Savings account', estimatedValue: 120000 }],
  liabilities: [{ type: 'tax', creditor: 'Revenue authority', balance: 5000 }],
} })
const base = {
  transaction: { id: 'example-transaction', reference: 'BOND-EXAMPLE-001' }, submissionVersion: 1,
  createdAt: '2026-10-03T18:00:00Z', applicationIntent: 'bond_application',
  property: { streetAddress: '1 Example Road', propertyReference: 'EXAMPLE PROPERTY', propertyType: 'freehold' },
  finance: { purchasePrice: 2200000, depositAmount: 200000, requestedBondAmount: 2000000 },
  participants: [person('primary_applicant', 'Zoë')],
  declarations: resolveBondApplicationDeclarations(), selectedBanks: ['Example Bank'],
  signerManifest: [{ participantRole: 'primary_applicant', fullName: 'Zoë Example', email: 'sample@example.test' }],
  documentManifest: [{ requirementKey: 'income', title: 'Proof of income', participantRole: 'primary_applicant', minimumFileCount: 3, status: 'partial', requiredBefore: 'bank_submission', documents: [{ id: 'sample' }] }],
}

test('readable values preserve zeros and false; money is formatted', () => {
  const rows = buildBondDocumentRows({ net_salary: 48000, dependants: 0, confirmed: false })
  assert.ok(rows.some((row) => row.value.includes('48') && row.value.includes('000') && row.value.startsWith('R')))
  assert.ok(rows.some((row) => row.value === '0'))
  assert.ok(rows.some((row) => row.value === 'No'))
  assert.ok(rows.every((row) => !row.label.includes('_')))
})

test('joint schema keeps participants and permissions separate', () => {
  const joint = structuredClone(base)
  joint.participants.push(person('co_applicant', 'Alex'))
  joint.declarations = []
  joint.participants.forEach((participant) => { participant.declarations = [{ key: 'authority', text: 'Example permission', accepted: false }] })
  const model = buildBondApplicationDocumentPresentation(joint)
  assert.ok(model.sections.some((section) => section.participant === 'Co applicant - Alex Example'))
  assert.equal(model.declarations.length, 2)
  assert.notEqual(model.declarations[0].participantKey, model.declarations[1].participantKey)
  assert.equal(model.documentChecklist[0].fileCount, 1)
  assert.equal(model.documentChecklist[0].minimumFileCount, 3)
})

test('self-employed answers use business and average-income labels', () => {
  const snapshot = structuredClone(base)
  snapshot.participants[0].answers.employment.occupation_status = 'self_employed'
  const rows = buildBondApplicationDocumentPresentation(snapshot).sections.flatMap((section) => section.rows)
  assert.ok(rows.some((row) => row.label === 'Business or trading name'))
  assert.ok(rows.some((row) => row.label === 'Average monthly income'))
})

test('renders single, joint and long self-employed draft examples', async () => {
  const fontBytes = new Uint8Array(await readFile(new URL('../../../../assets/fonts/DejaVuSans.ttf', import.meta.url)))
  const joint = structuredClone(base)
  joint.participants.push(person('co_applicant', 'Alex'))
  joint.signerManifest.push({ participantRole: 'co_applicant', fullName: 'Alex Example', email: 'second@example.test' })
  const business = structuredClone(base)
  business.participants[0].answers.employment = { occupation_status: 'self_employed', employer_name: 'Example Design Studio', occupation: 'Design consultant', businessDescription: 'We provide specialist design and consulting services for residential projects. '.repeat(90) }
  business.participants[0].answers.assets = Array.from({ length: 8 }, (_, index) => ({ description: `Example asset ${index + 1}`, estimatedValue: 50000 + index * 10000 }))
  for (const [name, snapshot] of [['single-applicant', base], ['joint-applicants', joint], ['self-employed-long', business]]) {
    const pdf = await renderBondApplicationPackPdf({ snapshot, manifest: { mode: 'draft', transactionId: 'EXAMPLE', generatedAt: base.createdAt, files: [], warnings: [], snapshotHash: 'EXAMPLE - NOT A SIGNED RECORD' }, brand: { name: 'Example Home Loans' }, readiness: { issues: [{ message: 'Upload the remaining proof of income before bank submission.' }] }, fontBytes })
    assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), '%PDF-')
    if (process.env.BOND_DESIGN_PREVIEW_DIR) {
      await mkdir(process.env.BOND_DESIGN_PREVIEW_DIR, { recursive: true })
      await writeFile(`${process.env.BOND_DESIGN_PREVIEW_DIR}/${name}.pdf`, pdf)
    }
  }
})
