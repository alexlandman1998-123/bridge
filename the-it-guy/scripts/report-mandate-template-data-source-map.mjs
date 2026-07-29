import { writeFile } from 'node:fs/promises'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import {
  buildMandateTemplateDataSourceReport,
  formatMandateTemplateDataSourceMapMarkdown,
} from '../src/core/documents/mandateTemplateDataSourceMap.js'

const sampleMandate = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    firstName: 'Sam',
    lastName: 'Seller',
    idNumber: '7801015009088',
    email: 'seller@example.com',
    phone: '0830000000',
    propertyAddress: '12 Sample Street, Pretoria',
    propertyStructureType: 'full_title',
    askingPrice: 2850000,
    commissionPercentage: 5,
    marketingPermissions: 'Marketing permitted on selected channels.',
    accessInstructions: 'Access by appointment.',
    status: 'completed',
  },
  mandateDraft: {
    mandateType: 'sole',
    mandateStartDate: '2026-07-28',
    mandateEndDate: '2026-10-28',
    vatHandling: 'exclusive',
    specialConditions: 'No special conditions captured.',
  },
  agency: {
    legalName: 'Samlin Properties (Pty) Ltd',
    tradingName: 'Samlin',
    registrationNumber: '2020/123456/07',
    vatNumber: '4123456789',
    address: '1 Main Road, Johannesburg',
    fspNumber: 'FSP-123456',
    ffcNumber: 'FFC-FIRM-123456',
  },
  agent: {
    fullName: 'Alex Agent',
    email: 'alex@example.com',
    phone: '0820000000',
    ffcNumber: 'FFC-AGENT-123456',
  },
})

const report = buildMandateTemplateDataSourceReport({
  generatedAt: '2026-07-28T12:00:00.000Z',
  placeholders: {
    ...sampleMandate.placeholders,
    property_disclosure_status: 'Completed and signed',
    property_disclosure_locked_at: '2026-07-28',
    property_disclosure_annexure: 'Mandatory Disclosure Form Annexure A',
    property_disclosure_comments: 'No known latent defects disclosed.',
  },
})

const outputUrl = new URL('../docs/mandate-template-vnext-phase3-data-source-map.md', import.meta.url)
await writeFile(outputUrl, formatMandateTemplateDataSourceMapMarkdown(report), 'utf8')

console.log(`Mandate template data source map written to ${outputUrl.pathname}`)
