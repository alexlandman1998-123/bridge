import {
  AlertTriangle,
  Bold,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  CopyPlus,
  Eye,
  FileSignature,
  FileText,
  FlaskConical,
  HelpCircle,
  Layers3,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  generateFinalSignedPacketDocument,
  generatePacketVersion,
  generateSigningLinks,
  getPacketSigningSummary,
  prepareSigningFields,
  renderPacketPreview,
} from '../../core/documents/packetService'
import { formatLegalDocumentGenerationRecovery, resolveLegalDocumentGenerationRecovery } from '../../core/documents/legalDocumentGenerationRecovery'
import { captureLegalDocumentGenerationBaseline, reconcileLegalDocumentGenerationFailure } from '../../core/documents/legalDocumentGenerationReconciliation'
import { resolveLegalDocumentRetryPolicy } from '../../core/documents/legalDocumentGenerationRetryPolicy'
import { recordLegalDocumentGenerationSupportHandoff } from '../../core/documents/legalDocumentGenerationSupportHandoff'
import {
  listCanonicalMergeFields,
  suggestCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from '../../core/documents/mergeFieldRegistry'
import {
  VISIBILITY_VALUELESS_OPERATORS,
  buildVisibilityConditionJson,
  normalizeVisibilityConditionInput,
} from '../../core/documents/sectionVisibilityRules'
import {
  buildMandateTemplatePublishGateReport,
  serializeMandateTemplatePublishGateScan,
} from '../../core/documents/mandateTemplatePublishGate'
import {
  archiveDocumentPacket,
  archiveDocumentPacketTemplate,
  appendDocumentPacketEvent,
  cloneDocumentPacketTemplate,
  createDocumentPacket,
  createEditableDocumentDraftFromTemplate,
  createDocumentPacketTemplate,
  createDocumentPacketTemplateRevision,
  fetchDocumentPacket,
  fetchDocumentPacketTemplate,
  listDocumentPackets,
  listDocumentPacketTemplates,
  listDocumentPlaceholderDefinitions,
  publishDocumentPacketTemplateRevision,
  updateDocumentPacketTemplate,
  uploadDocumentPacketTemplateAsset,
  upsertDocumentPlaceholderDefinition,
} from '../../lib/documentPacketsApi'
import { canManageOrganisationSettings, getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
} from './settingsUi'
import {
  DocumentCreationPanel,
  PreviewIssueSummary,
  SamplePreviewSupportPanel,
  TemplateCreationPanel,
  TemplateStatusPill,
  TemplateStudioMetricCard,
  TemplateStudioPanel,
  ValidationIssueCard,
} from './contractStudioUi'
import {
  DOCUMENT_RUN_SOURCE_OPTIONS,
  getDocumentKindOption,
  getDocumentRunReadiness,
  isSimpleDocumentBuilderEnabled,
  studioDangerButtonClass,
  studioPrimaryButtonClass,
  studioQuietButtonClass,
  studioSecondaryButtonClass,
} from './contractStudioConstants'
import { useWorkspace } from '../../context/WorkspaceContext'
import { listAgencyCrmLeadContacts } from '../../lib/agencyCrmRepository'
import { getOrganisationPrivateListings } from '../../services/privateListingService'
import {
  NATIVE_RENDERER_VERSION,
  TEMPLATE_RENDER_MODES,
  normalizeTemplateRenderMode,
  templateHasLegacySource,
} from '../../core/documents/structuredTemplateRenderer'
import StartDocumentModal from '../../components/documents/StartDocumentModal'
import {
  DOCUMENT_START_DOCUMENT_KINDS,
  DOCUMENT_START_ENTRY_POINTS,
  DOCUMENT_START_SOURCE_MODES,
} from '../../core/documents/documentStartRules'
import { normalizeLegalDocumentEditorScope } from '../../core/documents/legalDocumentCatalog'
import { listScopedLegalDocumentSectionEntries } from '../../core/documents/legalDocumentEditorScope'
import { getLegalDocumentEditorSituation } from '../../core/documents/legalDocumentEditorSituations'
import {
  assessConditionalMasterTemplate,
  buildConditionalMasterTemplateSections,
  getConditionalMasterTemplateDefinition,
} from '../../core/documents/conditionalMasterTemplateDefinitions'
import { evaluateConditionalMasterCoverage } from '../../core/documents/conditionalMasterCoverageReadiness'
import {
  listLegalDocumentPreviewScenarios,
  resolveLegalDocumentPreviewScenario,
} from '../../core/documents/legalDocumentPreviewScenarios'

const SUPPORTED_PACKET_TYPES = [
  {
    key: 'otp',
    label: 'Offer To Purchase',
    shortLabel: 'OTP',
    icon: FileSignature,
    subtitle: 'Template set for offer drafting and buyer signature journeys.',
  },
  {
    key: 'mandate',
    label: 'Mandate Agreement',
    shortLabel: 'Mandate',
    icon: FileText,
    subtitle: 'Template set for seller mandates and listing activation workflows.',
  },
  {
    key: 'commercial_lease',
    label: 'Commercial Lease',
    shortLabel: 'Lease',
    icon: FileText,
    subtitle: 'Template set for commercial leasing mandates and lease workflows.',
  },
  {
    key: 'commercial_sale',
    label: 'Commercial Sale',
    shortLabel: 'Sale',
    icon: FileSignature,
    subtitle: 'Template set for commercial sales mandates and due diligence workflows.',
  },
]

// Scenario-specific template routing has been retired for Mandate and OTP.
// Keep the legacy editor block dormant while historical metadata remains
// readable during the conditional-master migration.
const LEGACY_SCENARIO_TEMPLATE_ROUTING_UI_ENABLED = false

const DEFAULT_ALLOWED_PACKET_TYPES = ['otp', 'mandate']
const SUPPORTED_PACKET_TYPE_KEYS = new Set(SUPPORTED_PACKET_TYPES.map((item) => item.key))
const BLANK_CANVAS_TEMPLATE_STARTER = 'blank_canvas'
const CUSTOM_TEMPLATE_FAMILY = 'custom_template'
const STANDARD_LEGAL_TEMPLATE_FAMILY = 'standard_legal_template'
const ARCH9_DEFAULT_TEMPLATE_STARTER = 'arch9_standard_default'
const LEGAL_DEFAULT_TEMPLATE_SOURCE = 'arch9_agency_default'
const VIRTUAL_DEFAULT_TEMPLATE_ID_PREFIX = '__arch9_default_legal_template__'
const BLANK_TEMPLATE_DOCUMENT_KIND_KEYS = ['custom', 'addendum', 'amendment', 'annexure', 'standard']
const LEGAL_DEFAULT_TEMPLATE_DEFINITIONS = {
  otp: {
    templateKey: 'otp_default_v1',
    templateLabel: 'Offer to Purchase (OTP) · Default',
    description: 'Default editable OTP template for agency transactions.',
  },
  mandate: {
    templateKey: 'mandate_default_v1',
    templateLabel: 'Mandate Agreement · Default',
    description: 'Default editable seller mandate template for agency workflows.',
  },
}
const MANDATE_TEMPLATE_ROUTE_OPTIONS = [
  { key: 'default', label: 'All mandate situations' },
  { key: 'company_full_title', label: 'Company + Full Title' },
  { key: 'company_sectional_title', label: 'Company + Sectional Title' },
  { key: 'trust_full_title', label: 'Trust + Full Title' },
  { key: 'trust_sectional_title', label: 'Trust + Sectional Title' },
  { key: 'individual_full_title', label: 'Individual + Full Title' },
  { key: 'individual_sectional_title', label: 'Individual + Sectional Title' },
  { key: 'individual_spouse_consent_full_title', label: 'Married ICOP + Full Title' },
  { key: 'individual_spouse_consent_sectional_title', label: 'Married ICOP + Sectional Title' },
]
const LEGAL_PARTY_ROUTE_OPTIONS = [
  { key: 'any', label: 'Any party type' },
  { key: 'individual', label: 'Individual' },
  { key: 'individual_spouse_consent', label: 'Individual married in community' },
  { key: 'company', label: 'Company or CC' },
  { key: 'trust', label: 'Trust' },
]
const LEGAL_PROPERTY_ROUTE_OPTIONS = [
  { key: 'any', label: 'Any property type' },
  { key: 'full_title', label: 'Full title' },
  { key: 'sectional_title', label: 'Sectional title' },
]
const LEGAL_FINANCE_ROUTE_OPTIONS = [
  { key: 'any', label: 'Any finance type' },
  { key: 'cash', label: 'Cash' },
  { key: 'bond', label: 'Bond' },
  { key: 'combination', label: 'Cash and bond' },
]
const LEGAL_TEMPLATE_TABLE_SNIPPET = [
  '| Detail | Value |',
  '| --- | --- |',
  '| Property address | {{property_address}} |',
  '| Purchase price / mandate value | {{purchase_price}} |',
].join('\n')
const DOCUMENT_BLOCK_SNIPPETS = {
  paragraph: 'New paragraph wording...',
  heading: 'NEW CLAUSE HEADING',
  pageBreak: '[[PAGE_BREAK]]',
  signature: [
    'Signature: ______________________________',
    'Name: {{seller_full_name}}',
    'Date: {{signed_date}}',
  ].join('\n'),
  initials: 'Initials: {{seller_initials}}',
  witness: [
    'Witness:',
    'Signature: {{witness_signature}}',
    'Name: ______________________________',
  ].join('\n'),
}
const SECTION_EDITOR_INSERT_GROUPS = [
  {
    label: 'Content',
    items: [
      { key: 'paragraph', icon: Type, label: 'Text', title: 'Add paragraph text' },
      { key: 'heading', icon: Bold, label: 'Heading', title: 'Add a clause heading' },
      { key: 'table', icon: Table2, label: 'Table', title: 'Add a details table' },
      { key: 'pageBreak', icon: MoreHorizontal, label: 'Page break', title: 'Insert a page break' },
    ],
  },
  {
    label: 'Signing',
    items: [
      { key: 'signature', icon: FileSignature, label: 'Signature', title: 'Add a signature block' },
      { key: 'initials', icon: Check, label: 'Initial', title: 'Add an initials marker' },
      { key: 'witness', icon: ShieldCheck, label: 'Witness', title: 'Add a witness block' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { key: 'source', icon: FileText, label: 'Source', title: 'Open the raw source editor', action: 'source' },
    ],
  },
]
const CONTRACT_CLAUSE_LIBRARY_ITEMS = [
  {
    key: 'finance_suspensive_condition',
    category: 'Suspensive conditions',
    title: 'Bond finance suspensive condition',
    description: 'Standard bond approval wording with expiry and waiver language.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'This agreement is subject to the Purchaser obtaining written bond approval for an amount not less than {{bond_amount}} within the agreed fulfilment period.',
      'This condition is for the benefit of the Purchaser and may be waived by the Purchaser in writing before expiry.',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'finance_type',
      operator: 'equals',
      value: 'Bond',
      label: 'Only include when the buyer needs bond finance',
    },
  },
  {
    key: 'commission_payable',
    category: 'Commission',
    title: 'Commission payable on acceptance',
    description: 'Reusable agency commission wording for offers and mandates.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'The Seller shall pay commission to {{agency_legal_name}} in accordance with the agreed commission structure.',
      'Commission is deemed earned on acceptance and is payable on registration of transfer unless otherwise agreed in writing.',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'commission_structure',
      operator: 'exists',
      value: '',
      label: 'Use when a commission structure exists',
    },
  },
  {
    key: 'voetstoots_property_condition',
    category: 'Property conditions',
    title: 'Property sold voetstoots',
    description: 'Plain-language property condition wording for South African sale agreements.',
    status: 'Legal reviewed',
    locked: true,
    snippet: [
      'The Property is sold voetstoots, subject to all conditions, servitudes, restrictions and endorsements applicable to the Property.',
      'The Seller confirms that all known material defects disclosed to the Agency have been recorded or disclosed to the Purchaser.',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'property_address',
      operator: 'exists',
      value: '',
      label: 'Use when property details are available',
    },
  },
  {
    key: 'witness_signature_block',
    category: 'Signature blocks',
    title: 'Witness signature block',
    description: 'Reusable witness wording and signature placeholders.',
    status: 'Ready to use',
    locked: false,
    snippet: [
      'Witness:',
      'Signature: {{witness_signature}}',
      'Full name: ______________________________',
      'Date: {{signed_date}}',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'witness_signature',
      operator: 'exists',
      value: '',
      label: 'Use when witness signing is required',
    },
  },
  {
    key: 'seller_company_authority_pack',
    category: 'Seller authority',
    title: 'Seller company authority pack',
    description: 'Registration, representative capacity and resolution wording for company or close corporation sellers.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'Where the Seller is a company or close corporation, the person signing for the Seller warrants that they are duly authorised to sign this document and bind the Seller.',
      '',
      'Seller Registration Number: {{seller_company_registration_number}}',
      'Representative: {{seller_representative_name}}',
      'Representative Capacity: {{seller_representative_capacity}}',
      'Resolution Date: {{seller_resolution_date}}',
      'Authority Basis: {{seller_authority_basis}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'seller_entity_type',
      operator: 'in',
      value: 'company, close_corporation',
      label: 'Only include for company or close corporation sellers',
    },
  },
  {
    key: 'seller_individual_capacity_pack',
    category: 'Seller capacity',
    title: 'Individual seller capacity pack',
    description: 'Personal capacity and marital-status wording for individual sellers.',
    status: 'Ready to use',
    locked: true,
    snippet: [
      'Where the Seller is an individual, the Seller warrants that the marital status recorded below is correct and that the Seller has full contractual capacity to sign.',
      '',
      'Seller Marital Status: {{seller_marital_status}}',
      'Spouse Consent Required: {{seller_spouse_consent_required}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'seller_entity_type',
      operator: 'equals',
      value: 'individual',
      label: 'Only include for individual sellers',
    },
  },
  {
    key: 'seller_trust_authority_pack',
    category: 'Seller authority',
    title: 'Seller trust authority pack',
    description: 'Trust registration, trustee and authority wording for trust sellers.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'Where the Seller is a trust, the trustees or authorised representative warrant that the trust is duly authorised to enter into this document.',
      '',
      'Trust Registration Number: {{seller_trust_registration_number}}',
      'Trustees: {{seller_trustee_names}}',
      'Representative: {{seller_representative_name}}',
      'Representative Capacity: {{seller_representative_capacity}}',
      'Authority Basis: {{seller_authority_basis}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'seller_entity_type',
      operator: 'equals',
      value: 'trust',
      label: 'Only include for trust sellers',
    },
  },
  {
    key: 'seller_spouse_consent_pack',
    category: 'Seller capacity',
    title: 'Seller spouse consent pack',
    description: 'Consent and co-signature wording for sellers married in community of property.',
    status: 'Legal reviewed',
    locked: true,
    snippet: [
      'Where spousal consent is required, the Seller confirms that the spouse recorded below consents to this document and will sign where required.',
      '',
      'Seller Spouse: {{seller_spouse_full_name}}',
      'Spouse ID Number: {{seller_spouse_id_number}}',
      'Spouse Email: {{seller_spouse_email}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'seller_spouse_consent_required',
      operator: 'equals',
      value: 'Yes',
      label: 'Only include when seller spouse consent is required',
    },
  },
  {
    key: 'buyer_individual_capacity_pack',
    category: 'Buyer capacity',
    title: 'Individual buyer capacity pack',
    description: 'Personal capacity and marital-status wording for individual buyers.',
    status: 'Ready to use',
    locked: true,
    snippet: [
      'Where the Purchaser is an individual, the Purchaser warrants that the marital status recorded below is correct and that the Purchaser has full contractual capacity to sign.',
      '',
      'Purchaser Marital Status: {{buyer_marital_status}}',
      'Spouse Consent Required: {{buyer_spouse_consent_required}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'buyer_entity_type',
      operator: 'equals',
      value: 'individual',
      label: 'Only include for individual buyers',
    },
  },
  {
    key: 'buyer_company_authority_pack',
    category: 'Buyer authority',
    title: 'Buyer company authority pack',
    description: 'Registration, representative capacity and resolution wording for company or close corporation buyers.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'Where the Purchaser is a company or close corporation, the person signing for the Purchaser warrants that they are duly authorised to sign this agreement and bind the Purchaser.',
      '',
      'Purchaser Registration Number: {{buyer_company_registration_number}}',
      'Representative: {{buyer_representative_name}}',
      'Representative Capacity: {{buyer_representative_capacity}}',
      'Resolution Date: {{buyer_resolution_date}}',
      'Authority Basis: {{buyer_authority_basis}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'buyer_entity_type',
      operator: 'in',
      value: 'company, close_corporation',
      label: 'Only include for company or close corporation buyers',
    },
  },
  {
    key: 'buyer_trust_authority_pack',
    category: 'Buyer authority',
    title: 'Buyer trust authority pack',
    description: 'Trust registration, trustee and authority wording for trust buyers.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'Where the Purchaser is a trust, the trustees or authorised representative warrant that the trust is duly authorised to enter into this agreement.',
      '',
      'Trust Registration Number: {{buyer_trust_registration_number}}',
      'Trustees: {{buyer_trustee_names}}',
      'Representative: {{buyer_representative_name}}',
      'Representative Capacity: {{buyer_representative_capacity}}',
      'Authority Basis: {{buyer_authority_basis}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'buyer_entity_type',
      operator: 'equals',
      value: 'trust',
      label: 'Only include for trust buyers',
    },
  },
  {
    key: 'buyer_spouse_consent_pack',
    category: 'Buyer capacity',
    title: 'Buyer spouse consent pack',
    description: 'Consent and co-signature wording for buyers married in community of property.',
    status: 'Legal reviewed',
    locked: true,
    snippet: [
      'Where spousal consent is required, the Purchaser confirms that the spouse recorded below consents to this agreement and will sign where required.',
      '',
      'Purchaser Spouse: {{buyer_spouse_full_name}}',
      'Spouse ID Number: {{buyer_spouse_id_number}}',
      'Spouse Email: {{buyer_spouse_email}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'buyer_spouse_consent_required',
      operator: 'equals',
      value: 'Yes',
      label: 'Only include when buyer spouse consent is required',
    },
  },
  {
    key: 'cash_sale_pack',
    category: 'Finance',
    title: 'Cash sale payment pack',
    description: 'Cash-sale proof-of-funds and payment undertaking wording.',
    status: 'Ready to use',
    locked: true,
    snippet: [
      'Where this is a cash sale, the Purchaser must provide proof of funds or acceptable cash payment undertakings within the required period.',
      '',
      'Finance Type: {{finance_type}}',
      'Cash Amount: {{cash_amount}}',
    ].join('\n'),
    defaultCondition: {
      enabled: true,
      field: 'finance_type',
      operator: 'equals',
      value: 'cash',
      label: 'Only include for cash sale transactions',
    },
  },
  {
    key: 'breach_notice_jurisdiction_pack',
    category: 'General legal terms',
    title: 'Breach, notices and jurisdiction',
    description: 'Core enforcement wording covering breach notices, remedies and court jurisdiction.',
    status: 'Legal reviewed',
    locked: true,
    snippet: [
      'If a party breaches a material term and fails to remedy the breach after written notice, the other party may enforce its rights, claim damages, or cancel where allowed by law.',
      'The parties choose their recorded domicilium addresses for notices and consent to the jurisdiction recorded in this document.',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'property_address',
      operator: 'exists',
      value: '',
      label: 'Use as a standard agreement term',
    },
  },
  {
    key: 'whole_agreement_non_variation_pack',
    category: 'General legal terms',
    title: 'Whole agreement and non-variation',
    description: 'Standard entire-agreement, amendment, non-waiver and severability wording.',
    status: 'Principal approved',
    locked: true,
    snippet: [
      'This document, together with its schedules and annexures, records the whole agreement between the parties for this transaction.',
      'No amendment, addition, deletion, cancellation or waiver is valid unless reduced to writing and signed or accepted by the parties as required.',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'document_reference',
      operator: 'exists',
      value: '',
      label: 'Use as a standard agreement term',
    },
  },
  {
    key: 'popia_fica_processing_pack',
    category: 'Compliance',
    title: 'POPIA and FICA processing',
    description: 'Consent and verification wording for personal-information processing and compliance checks.',
    status: 'Legal reviewed',
    locked: true,
    snippet: [
      'The parties consent to the processing of personal information reasonably required for this transaction, including verification, conveyancing, finance, record keeping and communication.',
      'The parties shall provide documents and information reasonably required for FICA, identity verification, source-of-funds checks and transaction administration.',
    ].join('\n'),
    defaultCondition: {
      enabled: false,
      field: 'buyer_full_name',
      operator: 'exists',
      value: '',
      label: 'Use where parties supply personal or compliance information',
    },
  },
]
const LEGAL_CONDITION_COVERAGE_ITEMS = [
  {
    key: 'parties_authority',
    label: 'Parties & authority',
    description: 'Identity, capacity, entity authority and spouse-consent packs.',
    markers: ['parties', 'capacity', 'authority', 'spouse consent', 'seller_entity_type', 'buyer_entity_type'],
  },
  {
    key: 'property_disclosure',
    label: 'Property & disclosure',
    description: 'Property particulars, defects, servitudes, warranties and voetstoots wording.',
    markers: ['property', 'defects', 'servitudes', 'voetstoots', 'warranties', 'warranty'],
  },
  {
    key: 'price_finance_commission',
    label: 'Price, finance & commission',
    description: 'Purchase price, cash or bond finance, costs and agency commission terms.',
    markers: ['purchase price', 'finance', 'bond', 'cash sale', 'cash amount', 'commission', 'costs'],
  },
  {
    key: 'conditions_special_terms',
    label: 'Conditions & special terms',
    description: 'Suspensive conditions, special conditions, annexures and conflict wording.',
    markers: ['suspensive', 'special conditions', 'condition precedent', 'annexures', 'conflict'],
  },
  {
    key: 'breach_notices_jurisdiction',
    label: 'Breach, notices & jurisdiction',
    description: 'Breach remedies, domicilium, cooling-off and jurisdiction provisions.',
    markers: ['breach', 'domicilia', 'domicilium', 'jurisdiction', 'cooling-off', 'cooling off'],
  },
  {
    key: 'general_compliance',
    label: 'General legal provisions',
    description: 'Whole agreement, non-variation, non-waiver, severability, governing law, POPIA and FICA.',
    markers: ['whole agreement', 'non-variation', 'non-waiver', 'severability', 'applicable law', 'governing law', 'popia', 'fica', 'confidentiality'],
  },
  {
    key: 'signing_records',
    label: 'Signing & records',
    description: 'Signature blocks, witness fields, document reference and version metadata.',
    markers: ['signature', 'signatories', 'witness', 'document reference', 'template version'],
  },
]
const CONDITION_OPERATORS = [
  { key: 'equals', label: 'equals' },
  { key: 'not_equals', label: 'does not equal' },
  { key: 'contains', label: 'contains' },
  { key: 'in', label: 'is one of' },
  { key: 'not_in', label: 'is not one of' },
  { key: 'exists', label: 'is not empty' },
  { key: 'missing', label: 'is empty' },
]
const CONDITION_OPERATOR_LABELS = Object.fromEntries(CONDITION_OPERATORS.map((operator) => [operator.key, operator.label]))

function createConditionalPackCondition({ field = '', operator = 'equals', value = '', label = '' } = {}) {
  return buildVisibilityConditionJson({
    enabled: true,
    field,
    operator,
    value,
    label,
  })
}

const SIGNER_ROLE_OPTIONS = [
  { key: 'purchaser_1', label: 'Buyer' },
  { key: 'purchaser_2', label: 'Second buyer' },
  { key: 'buyer_spouse', label: 'Buyer spouse' },
  { key: 'seller', label: 'Seller' },
  { key: 'seller_spouse', label: 'Seller spouse' },
  { key: 'agent', label: 'Agent' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'witness_1', label: 'Witness 1' },
  { key: 'witness_2', label: 'Witness 2' },
  { key: 'other', label: 'Other signer' },
]
const SIGNING_FIELD_TYPE_OPTIONS = [
  { key: 'signature', label: 'Signature', width: 168, height: 44 },
  { key: 'initial', label: 'Initials', width: 44, height: 18 },
  { key: 'date', label: 'Date', width: 82, height: 22 },
  { key: 'text', label: 'Text', width: 130, height: 24 },
]
const SIGNING_FIELD_PAGE = {
  width: 595,
  height: 842,
}
const SIGNING_FIELD_POSITION_PRESETS = [
  { key: 'bottom_left', label: 'Bottom left', x: 68, y: 692 },
  { key: 'bottom_center', label: 'Bottom centre', x: 214, y: 692 },
  { key: 'bottom_right', label: 'Bottom right', x: 360, y: 692 },
  { key: 'initial_left', label: 'Initials left', x: 70, y: 748 },
  { key: 'initial_right', label: 'Initials right', x: 484, y: 748 },
]

function isEditorMarkdownTableLine(line = '') {
  return /^\s*\|.*\|\s*$/.test(String(line || ''))
}

function getEditorMarkdownTableCells(line = '') {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isEditorMarkdownTableSeparator(line = '') {
  const cells = getEditorMarkdownTableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderTemplateEditorInline(value = '', tokenLabels = {}) {
  const parts = String(value || '').split(/(\{\{\s*[^}]+?\s*\}\})/g)
  return parts.map((part, index) => {
    if (/^\{\{\s*[^}]+?\s*\}\}$/.test(part)) {
      const token = normalizeTemplateTokenKey(part.replace(/{{|}}/g, ''))
      const label = tokenLabels[token] || humanizeKey(token)
      return (
        <span
          key={`${part}-${index}`}
          title={`{{${token}}}`}
          className="inline-flex items-center rounded-[6px] bg-[#eef9f1] px-1.5 py-0.5 text-[0.82em] font-semibold text-[#128642]"
        >
          {label}
        </span>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

function renderTemplateEditorMarkdownTable(rows = [], key = '', tokenLabels = {}) {
  if (!rows.length) return null
  const [header = [], ...bodyRows] = rows
  return (
    <div key={key} className="my-3 overflow-hidden rounded-[12px] border border-[#dbe7f3] bg-white">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="bg-[#f6f9fc] text-[#102033]">
          <tr>
            {header.map((cell, index) => (
              <th key={`${key}-head-${index}`} className="border-b border-[#dbe7f3] px-3 py-2.5 font-semibold">
                {renderTemplateEditorInline(cell, tokenLabels)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`} className="border-t border-[#edf2f7] first:border-t-0">
              {header.map((_cell, cellIndex) => (
                <td key={`${key}-cell-${rowIndex}-${cellIndex}`} className="border-r border-[#edf2f7] px-3 py-2.5 align-top text-[#233246] last:border-r-0">
                  {renderTemplateEditorInline(row[cellIndex] || '', tokenLabels)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseTemplateEditorDocumentBlocks(value = '') {
  const lines = String(value || '').split(/\r?\n/)
  const blocks = []
  let paragraphLines = []

  const flushParagraph = () => {
    const paragraphText = paragraphLines.join('\n').trim()
    if (paragraphText) {
      blocks.push({
        type: paragraphText === DOCUMENT_BLOCK_SNIPPETS.pageBreak ? 'page_break' : 'paragraph',
        raw: paragraphText,
        text: paragraphText,
      })
    }
    paragraphLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    if (isEditorMarkdownTableLine(line) && isEditorMarkdownTableSeparator(nextLine)) {
      flushParagraph()
      const rawLines = [line, nextLine]
      const tableRows = [getEditorMarkdownTableCells(line)]
      index += 2
      while (index < lines.length && isEditorMarkdownTableLine(lines[index])) {
        rawLines.push(lines[index])
        tableRows.push(getEditorMarkdownTableCells(lines[index]))
        index += 1
      }
      index -= 1
      blocks.push({
        type: 'table',
        raw: rawLines.join('\n'),
        rows: tableRows,
      })
      continue
    }
    paragraphLines.push(line)
  }

  flushParagraph()
  return blocks
}

function serializeTemplateEditorDocumentBlocks(blocks = []) {
  return (blocks || [])
    .map((block) => String(block?.raw || block?.text || ''))
    .filter((block) => block.trim())
    .join('\n\n')
}

const AGENCY_DOCUMENT_TABS = [
  { key: 'otp', packetType: 'otp', label: 'Offer to Purchase (OTP)', icon: FileSignature },
  { key: 'sales_mandate', packetType: 'mandate', label: 'Sales Mandate', icon: FileText },
]

const GENERAL_ADDENDUM_TEMPLATE_FAMILY = 'general_addendum'
const OCCUPATION_ADDENDUM_TEMPLATE_FAMILY = 'occupation_addendum'
const PURCHASE_PRICE_ADDENDUM_TEMPLATE_FAMILY = 'purchase_price_addendum'
const SUSPENSIVE_CONDITION_ADDENDUM_TEMPLATE_FAMILY = 'suspensive_condition_addendum'
const FIXTURES_EXCLUSIONS_ADDENDUM_TEMPLATE_FAMILY = 'fixtures_exclusions_addendum'

const SIMPLE_SECTION_LABELS = [
  'Buyer Details',
  'Seller Details',
  'Property',
  'Purchase Price',
  'Deposit',
  'Occupation',
  'Conditions',
  'Suspensive Conditions',
  'Commission',
  'Transfer Costs',
  'Signatures',
]

const SECTION_HELP_TEXT = {
  'buyer details': 'Details of the buyer(s) entering into this agreement.',
  'seller details': 'Details of the seller(s) and their authority to sell.',
  property: 'Property information used in the document.',
  'purchase price': 'Price, payment terms, and related financial wording.',
  deposit: 'Deposit timing, amount, and handling instructions.',
  occupation: 'Occupation date, keys, and occupational rent wording.',
  conditions: 'General conditions that apply to the agreement.',
  'suspensive conditions': 'Conditions that must be met before the agreement proceeds.',
  commission: 'Agency commission and payment wording.',
  'transfer costs': 'Transfer duties, costs, and responsibility wording.',
  signatures: 'Signing wording and signature blocks.',
}

const TEMPLATE_STATUS_OPTIONS = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'archived', label: 'Archived' },
]

const PLACEHOLDER_KEY_PATTERN = /^[a-z0-9_.-]+$/i
const TEMPLATE_TOKEN_REPLACEMENTS = {
  agency_name: 'organisation_name',
}

const TEMPLATE_RENDER_MODE_OPTIONS = [
  { key: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED, label: 'Native Structured' },
  { key: TEMPLATE_RENDER_MODES.LEGACY_DOCX, label: 'Legacy DOCX' },
]
const SECTION_SIGNING_REQUIREMENT_OPTIONS = [
  { key: 'none', label: 'No client action', description: 'This section does not need a section-level signing mark.' },
  { key: 'client_initial', label: 'Client initials', description: 'The client must initial this section.' },
  { key: 'client_signature', label: 'Client signature', description: 'The client must sign this section.' },
]

const OTP_DEFAULT_LEGAL_TEXT = {
  cover_page: `OFFER TO PURCHASE

Property Address
{{property_address}}

Agent
{{agent_full_name}}

Agency
{{organisation_name}}

Document Reference
{{document_reference}}

Transaction Reference
{{transaction_reference}}

This Offer to Purchase becomes a deed of sale when accepted by the Seller in writing. The schedules, definitions, standard terms, special conditions and annexures form one agreement.`,
  schedule_1: `SCHEDULE 1 - TRANSACTION PARTICULARS

1.1 Purchaser Details

| Field | Details |
| --- | --- |
| Purchaser | {{buyer_full_name}} |
| Identity / Registration Number | {{buyer_id_number}} |
| Current / Domicilium Address | {{buyer_domicilium_address}} |
| Email | {{buyer_email}} |
| Telephone | {{buyer_phone}} |
| Marital Status | {{buyer_marital_status}} |
| Entity Type | {{buyer_entity_type}} |

The Purchaser warrants that the information supplied in this schedule is true and correct and that the Purchaser has the necessary legal capacity and authority to enter into this Agreement.

1.2 The Property

| Field | Details |
| --- | --- |
| Physical Address | {{property_address}} |
| Display Address | {{property_display_address}} |
| Suburb / Township | {{property_suburb}} |
| City | {{property_city}} |
| Property Type | {{property_type}} |
| Erf Number | {{erf_number}} |
| Unit Number | {{property_unit_number}} |
| Section Number | {{property_section_number}} |
| Sectional Title Number | {{sectional_title_number}} |
| Complex / Scheme | {{property_complex_name}} |
| Estate | {{property_estate_name}} |
| Parking Bay | {{parking_bay}} |
| Storeroom | {{storeroom}} |
| NHBRC Certificate | {{property_nhbrc_certificate_number}} |

1.3 Offer and Finance

| Field | Details |
| --- | --- |
| Purchase Price | {{purchase_price}} |
| Deposit due within 7 days of acceptance | {{deposit_amount}} |
| Finance Type | {{finance_type}} |
| Bond Finance Amount | {{bond_amount}} |
| Cash Contribution | {{cash_amount}} |
| Additional Costs Note | {{additional_costs_note}} |

1.4 Suspensive Conditions

Bond finance and other suspensive conditions are recorded below and are interpreted with clause 12.

{{suspensive_conditions}}

1.5 Occupation, Occupational Rental and Guarantees

| Field | Details |
| --- | --- |
| Occupation Date | {{occupation_date}} |
| Expected Transfer Date | {{transfer_date}} |
| Guarantee / Payment Delivery Period | As recorded by the conveyancer or transaction administrator |

1.6 Fixtures and Fittings

The Property is sold together with all fixtures and fittings of a permanent nature, including fixtures ordinarily attached to or used with the Property, unless expressly excluded in the Special Conditions or an annexure. Included or excluded items should be recorded in Special Conditions where applicable.

1.7 The Agent

| Field | Details |
| --- | --- |
| Agency | {{organisation_name}} |
| Agency Legal Name | {{agency_legal_name}} |
| Agency Registration Number | {{agency_registration_number}} |
| Agency VAT Number | {{agency_vat_number}} |
| Agency Address | {{agency_address}} |
| Agent | {{agent_full_name}} |
| Agent Email | {{agent_email}} |
| Agent Phone | {{agent_phone}} |
| Agent FFC Number | {{agent_ffc_number}} |

1.8 The Seller

| Field | Details |
| --- | --- |
| Seller | {{seller_full_name}} |
| Identity / Registration Number | {{seller_id_number}} |
| Entity Type | {{seller_entity_type}} |
| Domicilium Address | {{seller_domicilium_address}} |
| Email | {{seller_email}} |
| Telephone | {{seller_phone}} |

The Seller warrants that the Seller is the lawful owner of the Property or is duly authorised to dispose of the Property.

1.9 Conveyancing Attorneys

| Field | Details |
| --- | --- |
| Firm | {{attorney_firm_name}} |
| Conveyancer | {{conveyancer_name}} |
| Email | {{conveyancer_email}} |
| Reference | {{conveyancer_reference}} |`,
  schedule_2: `SCHEDULE 2 - PURCHASER ACKNOWLEDGEMENTS AND BOND REQUIREMENTS

2.1 Purchaser Acknowledgement

The Purchaser acknowledges that transfer costs, bond costs, transfer duty or VAT where applicable, registration expenses and other transaction costs may be payable in addition to the Purchase Price. The Purchaser confirms that these costs have been explained or disclosed sufficiently for the Purchaser to proceed with this offer.

Initials
{{buyer_initials}}

2.2 Bond Requirements

Where this Agreement is subject to bond finance, the Purchaser agrees to provide all applicable bond documentation to the bond originator, bank, conveyancer or transaction administrator within 5 working days of acceptance, or such other period as may be required by the transaction process.

Typical bond documents may include identity documents, proof of income, bank statements, employment confirmation, company or trust statutory documents, tax documents, financial statements, accountant or auditor letters, and any other documents reasonably required by the bond originator or lender.

Finance Type
{{finance_type}}

Bond Amount
{{bond_amount}}

2.3 FICA and Verification

The parties shall provide all documents and information reasonably required for FICA, identity verification, source-of-funds verification, conveyancing, finance, record keeping and transaction administration.`,
  cash_sale_pack: `CASH SALE PAYMENT REQUIREMENTS

Where this transaction is recorded as a cash sale, the Purchaser must provide proof of funds or acceptable cash payment undertakings to the Seller, Agent or Conveyancing Attorneys within the required period.

Finance Type
{{finance_type}}

Cash Amount
{{cash_amount}}

The Seller may require reasonable confirmation that the cash portion of the Purchase Price is available before transfer documentation proceeds.`,
  buyer_individual_capacity_pack: `PURCHASER INDIVIDUAL CAPACITY

Where the Purchaser is an individual, the Purchaser warrants that the marital status recorded in this agreement is correct and that the Purchaser has full contractual capacity to enter into this agreement.

Purchaser Marital Status
{{buyer_marital_status}}

Spouse Consent Required
{{buyer_spouse_consent_required}}`,
  buyer_company_authority_pack: `PURCHASER COMPANY AUTHORITY

Where the Purchaser is a company or close corporation, the signatory warrants that they are duly authorised to sign this agreement and bind the Purchaser.

Company / CC Registration Number
{{buyer_company_registration_number}}

Representative
{{buyer_representative_name}}

Representative Capacity
{{buyer_representative_capacity}}

Resolution Date
{{buyer_resolution_date}}

Authority Basis
{{buyer_authority_basis}}`,
  buyer_trust_authority_pack: `PURCHASER TRUST AUTHORITY

Where the Purchaser is a trust, the trustees or authorised representative warrant that the trust is duly authorised to enter into this agreement and that all required trustee approvals have been obtained.

Trust Registration Number
{{buyer_trust_registration_number}}

Trustees
{{buyer_trustee_names}}

Representative
{{buyer_representative_name}}

Representative Capacity
{{buyer_representative_capacity}}

Authority Basis
{{buyer_authority_basis}}`,
  buyer_spouse_consent_pack: `PURCHASER SPOUSE CONSENT

Where the Purchaser is married in community of property or spouse consent is otherwise required, the spouse recorded below consents to this agreement and will sign where required.

Purchaser Spouse
{{buyer_spouse_full_name}}

Spouse ID Number
{{buyer_spouse_id_number}}

Spouse Email
{{buyer_spouse_email}}`,
  seller_individual_capacity_pack: `SELLER INDIVIDUAL CAPACITY

Where the Seller is an individual, the Seller warrants that the marital status recorded below is correct and that the Seller has full contractual capacity to sell the Property and enter into this agreement.

Seller Marital Status
{{seller_marital_status}}

Spouse Consent Required
{{seller_spouse_consent_required}}`,
  seller_company_authority_pack: `SELLER COMPANY AUTHORITY

Where the Seller is a company or close corporation, the signatory warrants that they are duly authorised to sell the Property and bind the Seller to this agreement.

Company / CC Registration Number
{{seller_company_registration_number}}

Representative
{{seller_representative_name}}

Representative Capacity
{{seller_representative_capacity}}

Resolution Date
{{seller_resolution_date}}

Authority Basis
{{seller_authority_basis}}`,
  seller_trust_authority_pack: `SELLER TRUST AUTHORITY

Where the Seller is a trust, the trustees or authorised representative warrant that the trust is duly authorised to sell the Property and enter into this agreement.

Trust Registration Number
{{seller_trust_registration_number}}

Trustees
{{seller_trustee_names}}

Representative
{{seller_representative_name}}

Representative Capacity
{{seller_representative_capacity}}

Authority Basis
{{seller_authority_basis}}`,
  seller_spouse_consent_pack: `SELLER SPOUSE CONSENT

Where the Seller is married in community of property or spouse consent is otherwise required, the spouse recorded below consents to the sale and will sign where required.

Seller Spouse
{{seller_spouse_full_name}}

Spouse ID Number
{{seller_spouse_id_number}}

Spouse Email
{{seller_spouse_email}}`,
  definitions: `DEFINITIONS

In this Agreement, unless the context indicates otherwise:

"Agent" means the estate agent or agency representative recorded in Schedule 1.

"Agent's Commission" means the commission payable to the Agent or Agency as contemplated in clause 15.

"Agreement" means this Offer to Purchase, which constitutes a deed of sale when duly accepted by the Seller, together with all schedules and annexures attached to it.

"Consumption Charges" means charges payable for utilities supplied to the Property, including electricity, water, sewage, refuse and similar municipal or body corporate consumption charges.

"Conveyancing Attorneys" means the attorneys recorded in Schedule 1 or such other attorneys nominated or agreed to by the Seller.

"CPA" means the Consumer Protection Act 68 of 2008, as amended.

"Deposit" means the deposit recorded in Schedule 1.

"FICA" means the Financial Intelligence Centre Act 38 of 2001, as amended.

"Fixtures" means fixtures and fittings of a permanent nature included with the Property unless expressly excluded.

"Guarantee Delivery Period" means the period by which acceptable guarantees or cash undertakings must be delivered to the Conveyancing Attorneys.

"Home Owners Association" means the relevant homeowners association, body corporate or managing entity for the Property, if applicable.

"Occupation Date" means the date on which occupation is given to the Purchaser as recorded in Schedule 1 or otherwise agreed in writing.

"Occupational Rental" means the occupational rental payable where occupation and transfer do not occur on the same date.

"Purchase Price" means the purchase price recorded in Schedule 1, exclusive of VAT unless otherwise recorded.

"Property" means the immovable property described in Schedule 1, including Fixtures unless excluded.

"Purchaser" means the party or parties recorded as purchaser in Schedule 1.

"Seller" means the party or parties recorded as seller in Schedule 1.

"Special Conditions" means the conditions recorded in Schedule 1 or clause 23.

"Suspensive Conditions" means the conditions recorded in Schedule 1 and clause 12.

"VAT" means value-added tax in terms of the VAT Act.

"VAT Act" means the Value-Added Tax Act 89 of 1991, as amended.`,
  interpretation: `INTERPRETATION

Unless the contrary appears from the context:

1. Words importing natural persons include legal persons and vice versa.
2. Words importing one gender include every other gender.
3. Words importing the singular include the plural and vice versa.
4. Attachments, schedules and annexures are incorporated into this Agreement.
5. References to a party include that party's successors and lawful assigns.
6. References to legislation include that legislation as amended or replaced from time to time.
7. If a due date falls on a Saturday, Sunday or public holiday, the due date is the next business day.
8. When a number of days is prescribed, the first day is excluded and the last day is included unless the last day is not a business day.
9. Headings are for reference only and do not affect interpretation.
10. If a definition contains a substantive right or obligation, it is given effect as a substantive provision.
11. Words defined in this Agreement have the same meaning in attachments and annexures.
12. Where figures are written in numerals and words, the words prevail if there is a conflict.
13. No rule of interpretation applies against a party merely because that party or its representative prepared this Agreement.`,
  sale_acceptance: `SALE AND ACCEPTANCE

5. Sale

The Seller sells to the Purchaser, who purchases from the Seller, the Property on the terms and conditions set out in this Agreement.

6. Acceptance

6.1 This Offer to Purchase becomes a final and binding sale agreement upon written acceptance by the Seller.

6.2 If an irrevocable offer date is recorded in Schedule 1, the offer is irrevocable until midnight on that date and then lapses automatically if not accepted.

6.3 If no irrevocable offer date is recorded, the Purchaser may withdraw the offer by written notice delivered to the Seller before acceptance.`,
  purchase_price: `PURCHASE PRICE

7.1 The Purchase Price is payable as follows:

7.1.1 The Deposit is payable into trust with the Conveyancing Attorneys within 7 days of acceptance by the Seller. The Deposit is to be held in a special interest-bearing account for the benefit of the Purchaser until registration of transfer, with interest accruing to the Purchaser unless otherwise agreed.

7.1.2 The balance of the Purchase Price, after deduction of the Deposit, is payable on registration of transfer and must be secured by acceptable bank or financial institution guarantees, or by cash, to the satisfaction of the Seller and Conveyancing Attorneys.

7.1.3 Guarantees, cash payments or undertakings must be delivered within the Guarantee Delivery Period calculated from acceptance or fulfilment of all Suspensive Conditions, whichever occurs last.

7.2 If VAT is payable on the sale of the Property instead of transfer duty, the Purchase Price is exclusive of VAT unless otherwise recorded, and VAT is payable by the Purchaser on demand.

Purchase Price
{{purchase_price}}

Deposit
{{deposit_amount}}

Bond Amount
{{bond_amount}}

Cash Contribution
{{cash_amount}}`,
  property_risk_transfer: `THE PROPERTY, RISK AND TRANSFER

8. The Property

The Property is sold inclusive of Fixtures and fittings of a permanent nature, including those recorded in Schedule 1, but excluding items expressly excluded in Special Conditions or annexures. The Seller warrants that included Fixtures will be fully paid for as at the date of transfer.

9. Risk

Risk in and to the Property passes to the Purchaser from the Occupation Date or the date of registration of transfer, whichever occurs first, unless otherwise agreed in writing. From that date the Purchaser receives the benefits of the Property and is responsible for rates, taxes, levies, Consumption Charges and other charges attributable to occupation or ownership as applicable.

10. Transfer

10.1 Transfer shall be effected by the Conveyancing Attorneys.

10.2 Transfer costs, conveyancing fees, transfer duty, bond costs, registration expenses, estimated rates and taxes, levies and costs incidental to transfer are payable by the party responsible in terms of this Agreement and applicable law, on demand.

10.3 The Seller and Purchaser must sign all documents required by the Conveyancing Attorneys for registration of transfer and related bond registration.`,
  occupation: `OCCUPATION

11.1 Occupation is given on the Occupation Date, subject to compliance with this Agreement and, where applicable:

1. payment of the Deposit;
2. delivery of required guarantees or cash undertakings;
3. payment of the first month's Occupational Rental;
4. signature of transfer and bond documents and payment of required costs; and
5. the Purchaser not being in breach.

11.2 If occupation and transfer do not occur on the same date, the party in occupation must pay Occupational Rental monthly in advance, together with water, electricity and other Consumption Charges where applicable.

11.3 If no Occupational Rental amount is recorded, Occupational Rental is calculated at 1% of the Purchase Price per month unless otherwise agreed in writing.

11.4 If occupation is given before transfer, the Purchaser may not make alterations or additions without written consent and must vacate and restore the Property if this Agreement lapses or is cancelled.

11.5 Occupation before transfer does not create a tenancy.

Occupation Date
{{occupation_date}}`,
  suspensive_conditions: `SUSPENSIVE CONDITIONS

12.1 This Agreement may be subject to the Suspensive Conditions recorded in Schedule 1, including:

12.1.1 Bond finance approval for the Purchaser in an amount not less than the bond amount recorded in Schedule 1. The ordinary fulfilment period is 21 working days from acceptance unless extended by the Seller or Agent, up to a maximum of 60 working days where appropriate. This condition is for the benefit of the Purchaser and may be waived by the Purchaser before expiry.

12.1.2 Sale of the Purchaser's existing property, where applicable, within the period and at the minimum purchase price recorded in Schedule 1. The Purchaser must take reasonable steps to market that property and to link the conveyancing and finance process where necessary.

12.1.3 Any other suspensive condition recorded in Schedule 1 or below.

12.2 If a Suspensive Condition is not fulfilled or waived by the required date, this Agreement lapses and is of no further force or effect unless the parties agree otherwise in writing.

Suspensive Conditions
{{suspensive_conditions}}`,
  warranties_capacity: `WARRANTIES, NOMINATION AND CAPACITY OF PARTIES

13. Warranties

13.1 Except for warranties expressly recorded in this Agreement, the Seller gives no warranty regarding the Property, improvements, rights attaching to it or any other matter. The Property is sold voetstoots, subject to applicable South African law, title deed conditions, servitudes and any lease or occupancy rights disclosed.

13.2 The Purchaser acknowledges having inspected the Property to the Purchaser's satisfaction and confirms that no representation, guarantee or warranty has been relied upon unless recorded in writing.

13.3 The Seller does not warrant vacant occupation unless expressly recorded.

13.4 The Seller warrants that historical municipal rates and taxes owed in respect of the Property have been paid or will be attended to as required for transfer.

14. Nomination and Capacity

14.1 Where a party is a company, close corporation, trust, principal represented by an agent, trustee for an entity to be formed, or other juristic person, the signatory warrants authority and, where required, binds himself or herself as surety and co-principal debtor for the obligations of that party.

14.2 A person signing for a company or close corporation to be formed remains personally liable unless the entity is formed and adopts this Agreement within the required period.

14.3 The Purchaser undertakes to supply all FICA requirements and warrants that all information supplied is true and correct.`,
  commission_certificates: `COMMISSION AND CERTIFICATES

15. Commission

15.1 The Seller shall pay the Agent's Commission as agreed, deemed earned upon signature by both Seller and Purchaser and fulfilment or waiver of any condition precedent, and payable upon registration of transfer unless otherwise agreed.

15.2 If this Agreement is cancelled by mutual agreement, breach or default, commission consequences are determined by the commission agreement and applicable law.

15.3 The Purchaser warrants that the Agent recorded in Schedule 1 is the only estate agent who introduced the Purchaser to the Property and indemnifies the Seller against competing agent claims arising from the Purchaser.

Gross Commission Percentage
{{gross_commission_percentage}}

Gross Commission Amount
{{gross_commission_amount}}

Agency Commission
{{agency_commission_amount}}

Agent Commission
{{agent_commission_amount}}

16. Certificates

16.1 The Seller must, before transfer and at the Seller's cost where legally required, provide valid certificates of compliance for electrical installations and electric fencing where applicable.

16.2 If the Property is newly built, the Seller must provide an occupation certificate issued by the relevant local authority where required.

16.3 Where gas, electrical, electric fence, beetle, plumbing, water installation or other statutory certificates are required by law, lender, municipality or agreed transaction process, the responsible party must obtain them within the required time and attend to defects necessary for issue of those certificates.

16.4 The Purchaser must obtain any certificate required by the Purchaser's bank unless the defect or compliance obligation is one that the Seller must legally remedy.`,
  rates_breach_cooling: `RATES, TAXES, CONSUMPTION CHARGES, BREACH AND COOLING OFF

17. Rates, Taxes and Consumption Charges

17.1 The Seller is responsible for arrear levies, municipal rates, taxes and Consumption Charges due up to registration of transfer.

17.2 The Purchaser is responsible for Consumption Charges from occupation to transfer if occupation occurs before transfer.

17.3 The Seller must provide proof reasonably required that arrear levies, municipal rates, taxes and Consumption Charges have been settled or are sufficiently provided for.

18. Breach

18.1 If the Purchaser breaches a material term and fails to remedy the breach within 7 days after written notice, the Seller may cancel and claim damages or sue for the Purchase Price, interest and damages, without prejudice to other rights.

18.2 If the Seller breaches a material term and fails to remedy the breach within 7 days after written notice, the Purchaser may sue for specific performance and damages or cancel and claim damages, without prejudice to other rights.

19. Cooling Off

If the Purchaser is a natural person and the sale qualifies for a statutory cooling-off right under section 29A of the Alienation of Land Act 68 of 1981, the Purchaser may revoke the offer or terminate the sale agreement within the statutory period by written notice complying with that Act.`,
  notices_jurisdiction_marital: `DOMICILIA, JURISDICTION AND MARITAL STATUS

20. Domicilia and Notices

20.1 The parties choose the addresses and electronic contact details recorded in Schedule 1 as their domicilia and addresses for notices, legal process and transaction communication.

20.2 Notices are deemed delivered:

1. within 7 days after prepaid registered post;
2. on successful electronic transmission to the recorded email address;
3. on delivery by hand to the physical address; or
4. as otherwise permitted by law.

20.3 A party may change its address by written notice, provided the new physical address is within the Republic of South Africa.

21. Consent to Jurisdiction

21.1 Either party may institute proceedings in any Magistrates' Court having jurisdiction over the other party, even if the claim would otherwise exceed that court's monetary jurisdiction.

21.2 A foreign party consents to the jurisdiction of the High Court with jurisdiction over the Property.

22. Marital Status of Purchaser

The Purchaser warrants that the marital status recorded in Schedule 1 is true and correct.

Purchaser Marital Status
{{buyer_marital_status}}`,
  special_conditions: `SPECIAL CONDITIONS

23. Special Conditions

Special Conditions must be recorded below or in Schedule 1. Unless expressly stated to be suspensive or resolutive, they are not suspensive or resolutive.

No other conditions are binding unless reduced to writing and signed by the parties.

If Special Conditions conflict with standard provisions, the Special Conditions prevail to the extent of the conflict.

{{special_conditions}}`,
  costs_general_terms: `COSTS AND GENERAL LEGAL PROVISIONS

24. Costs

24.1 If either party takes legal action because of the other party's breach, the defaulting party is liable for legal costs on the attorney and own client scale, including collection costs, tracing costs and counsel's fees where applicable.

24.2 If a party fails to do something required at that party's cost, the other party may attend to it and recover the reasonable cost on demand.

25. Sale Board

The parties consent to the Agent affixing a sold board or notice to the Property from acceptance until 2 months after registration of transfer, unless prohibited by applicable estate, body corporate, municipal or other rules.

26. Whole Agreement

This Agreement constitutes the whole agreement between the parties regarding the sale of the Property.

27. Non-Variation

No amendment, alteration, deletion, addition, renewal, extension, cancellation or mutual termination is valid unless reduced to writing and signed by the Seller and Purchaser.

28. Non-Waiver

No latitude, indulgence, waiver or extension of time prejudices a party's rights or creates an expectation that it will be repeated.

29. Severability

Each provision is separate. If any provision is illegal, invalid or unenforceable, it is ineffective only to that extent and the remaining provisions continue in force.

30. Applicable Law

This Agreement is governed by and interpreted in accordance with the laws of the Republic of South Africa.

POPIA Consent

The parties consent to the processing of personal information reasonably required for this transaction, including verification, conveyancing, finance, record keeping and communication.`,
  signature_pages: `SIGNATORIES

SIGNED AND DATED BY THE PURCHASER at the place and on the date below, in the presence of the witness, the signatory being duly authorised.

Purchaser
{{buyer_full_name}}

Signature
{{buyer_signature}}

Initials
{{buyer_initials}}

Date
{{signed_date}}

Witness
{{witness_signature}}

SIGNED AND DATED BY THE SELLER at the place and on the date below, in the presence of the witness, the signatory being duly authorised.

Seller
{{seller_full_name}}

Signature
{{seller_signature}}

Initials
{{seller_initials}}

Date
{{signed_date}}

Witness
{{witness_signature}}

SIGNED AND DATED BY THE AGENT, who accepts the benefits of this Agreement on the terms contained herein.

Agency
{{organisation_name}}

Agent
{{agent_full_name}}

FFC Number
{{agent_ffc_number}}

CONTACT FORM

| Party | Telephone | Email |
| --- | --- | --- |
| Purchaser | {{buyer_phone}} | {{buyer_email}} |
| Seller | {{seller_phone}} | {{seller_email}} |
| Agent | {{agent_phone}} | {{agent_email}} |

DOCUMENT METADATA

Document Reference
{{document_reference}}

Transaction Reference
{{transaction_reference}}

Generated
{{generated_date}}

Template Version
{{template_version}}

Annexures
{{annexures_list}}`,
  buyer_details: `PURCHASER DETAILS

Purchaser
{{buyer_full_name}}

Identity / Registration Number
{{buyer_id_number}}

Email
{{buyer_email}}

Phone
{{buyer_phone}}

Domicilium Address
{{buyer_domicilium_address}}`,
  seller_details: `SELLER DETAILS

Seller
{{seller_full_name}}

Identity / Registration Number
{{seller_id_number}}

Email
{{seller_email}}

Phone
{{seller_phone}}

Domicilium Address
{{seller_domicilium_address}}`,
  property_details: `PROPERTY DETAILS

Property Address
{{property_address}}

Erf Number
{{erf_number}}

Property Type
{{property_type}}`,
  purchase_terms: `PURCHASE PRICE AND FINANCE

Purchase Price
{{purchase_price}}

Deposit
{{deposit_amount}}

Bond Amount
{{bond_amount}}

Cash Contribution
{{cash_amount}}`,
  occupation_transfer: `OCCUPATION AND TRANSFER

Occupation Date
{{occupation_date}}

Transfer Date
{{transfer_date}}`,
  seller_warranties: `WARRANTIES

The Seller and Purchaser give the warranties recorded in the full OTP warranty, voetstoots, capacity and disclosure clauses.`,
  commission_terms: `COMMISSION

Gross Commission Percentage
{{gross_commission_percentage}}

Gross Commission Amount
{{gross_commission_amount}}`,
  costs_transfer: `COSTS AND TRANSFER

Conveyancing Firm
{{attorney_firm_name}}

Conveyancer
{{conveyancer_name}}`,
  general_legal_provisions: `GENERAL LEGAL PROVISIONS

The full OTP provisions include breach, notices, jurisdiction, costs, whole agreement, non-variation, non-waiver, severability, applicable law, POPIA and FICA clauses.`,
}

const SALES_MANDATE_DEFAULT_LEGAL_TEXT = {
  introduction_purpose: `APPOINTMENT OF ESTATE AGENT

This Sales Mandate Agreement is entered into between the Seller and the Agency for the purpose of authorising the Agency to market the Property and procure a willing and able purchaser.

Seller:
{{seller_full_name}}
Identity / Registration Number: {{seller_id_number}}
Entity Type: {{seller_entity_type}}
Domicilium Address: {{seller_domicilium_address}}

Agency:
{{agency_legal_name}}
Trading as: {{organisation_name}}
Registration Number: {{agency_registration_number}}
VAT Number: {{agency_vat_number}}
FSP Number: {{agency_fsp_number}}
Address: {{agency_address}}

Agent:
{{agent_full_name}}
Email: {{agent_email}}
Phone: {{agent_phone}}
FFC Number: {{agent_ffc_number}}

The Seller hereby appoints the Agency to market and procure a purchaser for the Property described in this Agreement upon the terms and conditions contained herein.

The parties agree that this document constitutes a legally binding estate agency mandate, subject to applicable South African law.`,
  parties: `SELLER DETAILS

Seller Full Name: {{seller_full_name}}
ID / Registration Number: {{seller_id_number}}
Email: {{seller_email}}
Phone: {{seller_phone}}
Entity Type: {{seller_entity_type}}
Marital Status: {{seller_marital_status}}
Domicilium Address: {{seller_domicilium_address}}

The Seller confirms that the information supplied to the Agency is true and correct to the best of the Seller's knowledge.`,
  seller_individual_capacity_pack: `INDIVIDUAL SELLER CAPACITY

Where the Seller is an individual, the Seller warrants that the Seller has full contractual capacity to grant this mandate and that the marital status recorded below is correct.

Seller Marital Status
{{seller_marital_status}}

Spouse Consent Required
{{seller_spouse_consent_required}}`,
  seller_company_authority_pack: `SELLER COMPANY AUTHORITY

Where the Seller is a company or close corporation, the signatory warrants that they are duly authorised to appoint the Agency and bind the Seller to this mandate.

Company / CC Registration Number
{{seller_company_registration_number}}

Representative
{{seller_representative_name}}

Representative Capacity
{{seller_representative_capacity}}

Resolution Date
{{seller_resolution_date}}

Authority Basis
{{seller_authority_basis}}`,
  seller_trust_authority_pack: `SELLER TRUST AUTHORITY

Where the Seller is a trust, the trustees or authorised representative warrant that the trust is duly authorised to appoint the Agency and grant this mandate.

Trust Registration Number
{{seller_trust_registration_number}}

Trustees
{{seller_trustee_names}}

Representative
{{seller_representative_name}}

Representative Capacity
{{seller_representative_capacity}}

Authority Basis
{{seller_authority_basis}}`,
  seller_spouse_consent_pack: `SELLER SPOUSE CONSENT

Where the Seller is married in community of property or spouse consent is otherwise required, the spouse recorded below consents to this mandate and will sign where required.

Seller Spouse
{{seller_spouse_full_name}}

Spouse ID Number
{{seller_spouse_id_number}}

Spouse Email
{{seller_spouse_email}}`,
  property_details: `PROPERTY DETAILS

Property Address: {{property_address}}
Display Address: {{property_display_address}}
Suburb: {{property_suburb}}
City: {{property_city}}
Property Type: {{property_type}}
Title Type: {{property_title_type}}

The Seller warrants that the Seller is duly authorised to mandate the marketing of the Property.

The Seller shall disclose to the Agency any material facts, defects, restrictions, servitudes, disputes, rules, or other matters which may reasonably affect the marketing, sale, transfer, or value of the Property.`,
  property_full_title_pack: `FULL TITLE PROPERTY DETAILS

Where the Property is a full title property, the Seller confirms the registered land particulars recorded below and will provide any title deed, rates, servitude, estate, HOA, or municipal information reasonably required for marketing and transfer.

Title Type
{{property_title_type}}

Erf Number
{{erf_number}}

Erf Size
{{erf_size}}

Floor Size
{{floor_size}}

Estate / HOA
{{property_estate_name}}`,
  property_sectional_title_pack: `SECTIONAL TITLE PROPERTY DETAILS

Where the Property is a sectional title, share block, apartment, flat, or unit, the Seller confirms the scheme particulars recorded below and will disclose any body corporate, levy, conduct rule, exclusive use, parking, storage, or scheme issue relevant to marketing and transfer.

Title Type
{{property_title_type}}

Unit Number
{{property_unit_number}}

Section Number
{{property_section_number}}

Sectional Title Number
{{sectional_title_number}}

Complex / Scheme Name
{{property_complex_name}}

Estate Name
{{property_estate_name}}`,
  mandate_terms: `MANDATE TERMS

Mandate Type: {{mandate_type}}
Mandate Start Date: {{mandate_start_date}}
Mandate End Date: {{mandate_end_date}}

Mandate Purpose:
{{mandate_introduction_purpose}}

Authority Granted:
{{mandate_authority_granted}}

Access Instructions:
{{mandate_access_instructions}}

The Seller authorises the Agency to advertise the Property, introduce prospective purchasers, arrange viewings, receive and present offers, negotiate terms subject to the Seller's final approval, and communicate with relevant service providers where reasonably required.

The Agency shall use reasonable commercial efforts to market the Property during the mandate period.

The Seller undertakes to cooperate with the Agency and to provide all information and documents reasonably required for the proper performance of this mandate.`,
  commission_terms: `COMMISSION TERMS

Asking Price: {{asking_price}}
Commission Structure: {{commission_structure}}
Commission Percentage: {{mandate_commission_percent}}
Commission Amount: {{mandate_commission_amount}}
VAT Handling: {{vat_handling}}

Commission shall become due and payable to the Agency upon the conclusion of a valid and binding agreement of sale between the Seller and a purchaser introduced by the Agency, or where the Agency was the effective cause of the sale.

Where VAT is applicable, VAT shall be charged in accordance with prevailing South African tax legislation.

The Seller acknowledges that commission may be recorded in the Offer to Purchase or sale agreement and may be recovered in accordance with the applicable transaction documents.`,
  marketing_listing_terms: `MARKETING / LISTING AUTHORITY

Marketing Permissions:
{{mandate_marketing_permissions}}

The Seller authorises the Agency to market the Property using lawful marketing channels, including property portals, agency websites, social media, email marketing, buyer databases, printed marketing material, signage, photography, video, and other reasonable advertising channels.

The Seller grants permission for the Agency to create and use photographs, videos, floor plans, drone footage, descriptions, and other marketing material relating to the Property for the purpose of marketing the Property.

The Agency shall take reasonable care to ensure that marketing material is accurate and not misleading, based on the information supplied by the Seller.`,
  special_conditions: `SPECIAL CONDITIONS

Special Conditions:
{{special_conditions}}

Annexures:
{{annexures_list}}

Any special conditions recorded above shall form part of this mandate.

If there is any conflict between the special conditions and the standard terms of this mandate, the special conditions shall prevail to the extent of the conflict.

POPIA:
The Seller consents to the processing of personal information reasonably required for the performance of this mandate, including marketing, communication, verification, record keeping, and transaction administration.

Confidentiality:
The parties agree to treat confidential transaction information with reasonable care and not to disclose such information except where required for the performance of this mandate, by law, or with the consent of the relevant party.

Entire Agreement:
This mandate constitutes the entire agreement between the parties regarding the appointment of the Agency. No amendment shall be valid unless reduced to writing and accepted by the parties.

Governing Law:
This mandate shall be governed by the laws of the Republic of South Africa.`,
  signature_pages: `SIGNATURE PAGES

Seller:
{{seller_full_name}}
Signature: {{seller_signature}}
Initials: {{seller_initials}}
Date: {{signed_date}}

Agent:
{{agent_full_name}}
Agency: {{organisation_name}}
FFC Number: {{agent_ffc_number}}
Signature: __________________________
Date: {{signed_date}}

Witness:
Signature: {{witness_signature}}

Document Reference: {{document_reference}}
Transaction Reference: {{transaction_reference}}
Generated Date: {{generated_date}}
Template Version: {{template_version}}`,
}

const GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT = {
  cover_page: `GENERAL ADDENDUM

This Addendum is prepared as an additional document linked to the existing agreement or mandate recorded below.

Property:
{{property_address}}

Document Reference:
{{document_reference}}

Transaction Reference:
{{transaction_reference}}

Generated Date:
{{generated_date}}

Template Version:
{{template_version}}`,
  otp_parties: `PARTIES

The parties to this Addendum are:

| Party | Details |
| --- | --- |
| Purchaser | {{buyer_full_name}} |
| Seller | {{seller_full_name}} |
| Agency | {{agency_legal_name}} |
| Agent | {{agent_full_name}} |

This Addendum forms part of the Offer to Purchase or related transaction documents for the Property.`,
  mandate_parties: `PARTIES

The parties to this Addendum are:

| Party | Details |
| --- | --- |
| Seller | {{seller_full_name}} |
| Agency | {{agency_legal_name}} |
| Agent | {{agent_full_name}} |

This Addendum forms part of the mandate or related listing documents for the Property.`,
  linked_document: `LINKED DOCUMENT

This Addendum must be read together with the existing agreement, mandate, or document pack linked to the Property.

Unless expressly changed by this Addendum, all terms of the linked document remain unchanged and continue to apply.`,
  agreed_changes: `AGREED ADDENDUM TERMS

The parties agree to the following additional, amended, or clarified terms:

{{special_conditions}}

Where applicable, the updated commercial particulars are:

| Detail | Value |
| --- | --- |
| Purchase price / value | {{purchase_price}} |
| Occupation date | {{occupation_date}} |
| Transfer date | {{transfer_date}} |

If a field above is not applicable, it may be removed or marked as not applicable before the Addendum is sent for signature.`,
  occupation_terms: `OCCUPATION DATE ADDENDUM

The parties agree to amend or confirm the occupation arrangements for the Property as follows:

| Detail | Value |
| --- | --- |
| Property | {{property_address}} |
| Occupation date | {{occupation_date}} |
| Transfer date | {{transfer_date}} |

The occupation date, handover arrangements, keys, and any related occupation conditions must be read with the linked document.

Special occupation terms:
{{special_conditions}}

All other terms of the linked document remain unchanged unless expressly amended in this Addendum.`,
  purchase_price_terms: `PURCHASE PRICE ADDENDUM

The parties agree to amend or confirm the purchase price and related financial terms as follows:

| Detail | Value |
| --- | --- |
| Purchase price | {{purchase_price}} |
| Deposit | {{deposit_amount}} |
| Bond amount | {{bond_amount}} |
| Cash contribution | {{cash_amount}} |

Special financial terms:
{{special_conditions}}

The parties confirm that all other payment, transfer, and performance obligations in the linked document remain unchanged unless expressly amended in this Addendum.`,
  suspensive_condition_terms: `SUSPENSIVE CONDITION ADDENDUM

The parties agree to amend, add, waive, or confirm the following suspensive condition:

{{suspensive_conditions}}

Additional condition wording:
{{special_conditions}}

Unless the wording above expressly provides otherwise, the time periods, notice requirements, and consequences of non-fulfilment recorded in the linked document remain in force.`,
  fixtures_exclusions_terms: `FIXTURES AND EXCLUSIONS ADDENDUM

The parties agree to clarify the fixtures, fittings, exclusions, and items included with the Property.

Property:
{{property_address}}

Included / excluded items:
{{special_conditions}}

Annexures or supporting lists:
{{annexures_list}}

If there is any conflict between this Addendum and the linked document regarding fixtures or exclusions, this Addendum prevails only to the extent of that conflict.`,
  unchanged_terms: `UNCHANGED TERMS

Except to the extent expressly varied by this Addendum, every term, condition, warranty, undertaking, date, amount, and obligation contained in the linked document remains in full force and effect.

If there is a conflict between this Addendum and the linked document, this Addendum will prevail only to the extent of that conflict.

Annexures:
{{annexures_list}}`,
  otp_signatures: `SIGNATURES

SIGNED BY THE PURCHASER

Purchaser:
{{buyer_full_name}}

Signature:
{{buyer_signature}}

Initials:
{{buyer_initials}}

Date:
{{signed_date}}

SIGNED BY THE SELLER

Seller:
{{seller_full_name}}

Signature:
{{seller_signature}}

Initials:
{{seller_initials}}

Date:
{{signed_date}}

Witness:
{{witness_signature}}

Agency:
{{organisation_name}}

Agent:
{{agent_full_name}}

FFC Number:
{{agent_ffc_number}}`,
  mandate_signatures: `SIGNATURES

SIGNED BY THE SELLER

Seller:
{{seller_full_name}}

Signature:
{{seller_signature}}

Initials:
{{seller_initials}}

Date:
{{signed_date}}

Witness:
{{witness_signature}}

Agency:
{{organisation_name}}

Agent:
{{agent_full_name}}

FFC Number:
{{agent_ffc_number}}`,
}

const ADDENDUM_TEMPLATE_STARTERS = [
  {
    key: GENERAL_ADDENDUM_TEMPLATE_FAMILY,
    label: 'General Addendum',
    shortLabel: 'General',
    description: 'Broad addendum for any agreed change, clarification, or extra term.',
    templateLabel: 'General Addendum',
    templateKeySegment: 'general_addendum',
    termsSectionLabel: 'Agreed Addendum Terms',
    termsLegalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.agreed_changes,
    placeholderKeysText: 'special_conditions, purchase_price, occupation_date, transfer_date',
  },
  {
    key: OCCUPATION_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Occupation Date Addendum',
    shortLabel: 'Occupation',
    description: 'Change or confirm occupation date, keys, handover, or related occupation terms.',
    templateLabel: 'Occupation Date Addendum',
    templateKeySegment: 'occupation_addendum',
    termsSectionLabel: 'Occupation Terms',
    termsLegalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.occupation_terms,
    placeholderKeysText: 'property_address, occupation_date, transfer_date, special_conditions',
  },
  {
    key: PURCHASE_PRICE_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Purchase Price Addendum',
    shortLabel: 'Price',
    description: 'Record a purchase price, deposit, bond amount, or cash contribution change.',
    templateLabel: 'Purchase Price Addendum',
    templateKeySegment: 'purchase_price_addendum',
    termsSectionLabel: 'Price and Finance Terms',
    termsLegalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.purchase_price_terms,
    placeholderKeysText: 'purchase_price, deposit_amount, bond_amount, cash_amount, special_conditions',
  },
  {
    key: SUSPENSIVE_CONDITION_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Suspensive Condition Addendum',
    shortLabel: 'Condition',
    description: 'Add, amend, waive, or confirm a bond or other suspensive condition.',
    templateLabel: 'Suspensive Condition Addendum',
    templateKeySegment: 'suspensive_condition_addendum',
    termsSectionLabel: 'Suspensive Condition Terms',
    termsLegalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.suspensive_condition_terms,
    placeholderKeysText: 'suspensive_conditions, special_conditions',
  },
  {
    key: FIXTURES_EXCLUSIONS_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Fixtures and Exclusions Addendum',
    shortLabel: 'Fixtures',
    description: 'Clarify included fixtures, fittings, exclusions, and attached lists.',
    templateLabel: 'Fixtures and Exclusions Addendum',
    templateKeySegment: 'fixtures_exclusions_addendum',
    termsSectionLabel: 'Fixtures and Exclusions',
    termsLegalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.fixtures_exclusions_terms,
    placeholderKeysText: 'property_address, special_conditions, annexures_list',
  },
]

const ADDENDUM_TEMPLATE_STARTER_OPTIONS = ADDENDUM_TEMPLATE_STARTERS.map((starter) => ({
  key: starter.key,
  label: starter.label,
  shortLabel: starter.shortLabel,
  description: starter.description,
}))

const ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS = {
  [GENERAL_ADDENDUM_TEMPLATE_FAMILY]: {
    key: GENERAL_ADDENDUM_TEMPLATE_FAMILY,
    label: 'General Addendum',
    helperText: 'Capture the agreed change in plain language. Linked transaction details can still fill the rest.',
    fields: [
      { key: 'property_address', label: 'Property address', control: 'text', placeholder: 'Property affected by this addendum' },
      { key: 'special_conditions', label: 'Agreed wording', control: 'textarea', rows: 4, placeholder: 'Write the exact agreed change, clarification, or extra term.' },
      { key: 'purchase_price', label: 'Purchase price / value', control: 'text', placeholder: 'Optional' },
      { key: 'occupation_date', label: 'Occupation date', control: 'date', placeholder: '' },
      { key: 'transfer_date', label: 'Transfer date', control: 'date', placeholder: '' },
    ],
  },
  [OCCUPATION_ADDENDUM_TEMPLATE_FAMILY]: {
    key: OCCUPATION_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Occupation Date Addendum',
    helperText: 'Use this when the parties change or confirm occupation timing, keys, or handover terms.',
    fields: [
      { key: 'property_address', label: 'Property address', control: 'text', placeholder: 'Property affected by this addendum' },
      { key: 'occupation_date', label: 'Occupation date', control: 'date', placeholder: '' },
      { key: 'transfer_date', label: 'Expected transfer date', control: 'date', placeholder: '' },
      { key: 'special_conditions', label: 'Occupation terms', control: 'textarea', rows: 4, placeholder: 'Keys, handover, occupational rent, access, or other occupation terms.' },
    ],
  },
  [PURCHASE_PRICE_ADDENDUM_TEMPLATE_FAMILY]: {
    key: PURCHASE_PRICE_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Purchase Price Addendum',
    helperText: 'Use this when price, deposit, bond, or cash contribution terms change.',
    fields: [
      { key: 'property_address', label: 'Property address', control: 'text', placeholder: 'Property affected by this addendum' },
      { key: 'purchase_price', label: 'Purchase price', control: 'text', placeholder: 'R 0.00' },
      { key: 'deposit_amount', label: 'Deposit', control: 'text', placeholder: 'Optional' },
      { key: 'bond_amount', label: 'Bond amount', control: 'text', placeholder: 'Optional' },
      { key: 'cash_amount', label: 'Cash contribution', control: 'text', placeholder: 'Optional' },
      { key: 'special_conditions', label: 'Financial terms', control: 'textarea', rows: 4, placeholder: 'Payment timing, conditions, or finance wording.' },
    ],
  },
  [SUSPENSIVE_CONDITION_ADDENDUM_TEMPLATE_FAMILY]: {
    key: SUSPENSIVE_CONDITION_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Suspensive Condition Addendum',
    helperText: 'Use this to add, amend, waive, extend, or confirm a condition.',
    fields: [
      { key: 'property_address', label: 'Property address', control: 'text', placeholder: 'Property affected by this addendum' },
      { key: 'suspensive_conditions', label: 'Condition wording', control: 'textarea', rows: 4, placeholder: 'Write the condition, waiver, extension, or fulfilment wording.' },
      { key: 'special_conditions', label: 'Additional notes', control: 'textarea', rows: 3, placeholder: 'Optional supporting wording.' },
    ],
  },
  [FIXTURES_EXCLUSIONS_ADDENDUM_TEMPLATE_FAMILY]: {
    key: FIXTURES_EXCLUSIONS_ADDENDUM_TEMPLATE_FAMILY,
    label: 'Fixtures and Exclusions Addendum',
    helperText: 'Use this to make included and excluded items clear before signature.',
    fields: [
      { key: 'property_address', label: 'Property address', control: 'text', placeholder: 'Property affected by this addendum' },
      { key: 'special_conditions', label: 'Included / excluded items', control: 'textarea', rows: 4, placeholder: 'List included fixtures, excluded items, appliances, curtains, remotes, or other items.' },
      { key: 'annexures_list', label: 'Annexures or supporting lists', control: 'textarea', rows: 3, placeholder: 'Optional attachment names or references.' },
    ],
  },
}

const ADDENDUM_DOCUMENT_DETAIL_OPTIONS = ADDENDUM_TEMPLATE_STARTERS.map((starter) => ({
  key: starter.key,
  label: starter.label,
  shortLabel: starter.shortLabel,
  description: starter.description,
  fields: ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS[starter.key]?.fields || [],
  helperText: ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS[starter.key]?.helperText || starter.description,
}))

function getAddendumTemplateStarter(starterKind = GENERAL_ADDENDUM_TEMPLATE_FAMILY) {
  const normalized = normalizeText(starterKind).toLowerCase() || GENERAL_ADDENDUM_TEMPLATE_FAMILY
  return ADDENDUM_TEMPLATE_STARTERS.find((starter) => starter.key === normalized) || null
}

function getAddendumDetailConfig(addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY) {
  const normalized = normalizeText(addendumType).toLowerCase() || GENERAL_ADDENDUM_TEMPLATE_FAMILY
  return ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS[normalized] || ADDENDUM_DOCUMENT_DETAIL_FIELD_GROUPS[GENERAL_ADDENDUM_TEMPLATE_FAMILY]
}

function getDefaultRenderMode(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  return normalized === 'mandate' || normalized.startsWith('commercial_')
    ? TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
    : TEMPLATE_RENDER_MODES.LEGACY_DOCX
}

function getTemplateFormatForMode(renderMode = TEMPLATE_RENDER_MODES.LEGACY_DOCX) {
  return renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'html' : 'docx'
}

function createStarterBaseSections(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  if (normalized === 'mandate') {
    return [
      {
        sectionKey: 'introduction_purpose',
        sectionLabel: 'Introduction and Purpose',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.introduction_purpose,
        placeholderKeysText: 'seller_full_name, seller_id_number, seller_entity_type, seller_domicilium_address, agency_legal_name, organisation_name, agency_registration_number, agency_vat_number, agency_fsp_number, agency_address, agent_full_name, agent_email, agent_phone, agent_ffc_number',
        isRequired: true,
        sortOrder: 0,
      },
      {
        sectionKey: 'parties',
        sectionLabel: 'Parties',
        sectionType: 'dynamic_fields',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.parties,
        placeholderKeysText: 'seller_full_name, seller_id_number, seller_email, seller_phone, seller_entity_type, seller_marital_status, seller_domicilium_address',
        isRequired: true,
        sortOrder: 1,
      },
      {
        sectionKey: 'seller_individual_capacity_pack',
        sectionLabel: 'Individual Seller Capacity Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_individual_capacity_pack,
        placeholderKeysText: 'seller_entity_type, seller_marital_status, seller_spouse_consent_required',
        conditionJson: createConditionalPackCondition({
          field: 'seller_entity_type',
          operator: 'equals',
          value: 'individual',
          label: 'Only include for individual sellers',
        }),
        isRequired: false,
        sortOrder: 2,
      },
      {
        sectionKey: 'seller_company_authority_pack',
        sectionLabel: 'Seller Company Authority Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_company_authority_pack,
        placeholderKeysText: 'seller_entity_type, seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
        conditionJson: createConditionalPackCondition({
          field: 'seller_entity_type',
          operator: 'in',
          value: 'company, close_corporation',
          label: 'Only include for company or close corporation sellers',
        }),
        isRequired: false,
        sortOrder: 3,
      },
      {
        sectionKey: 'seller_trust_authority_pack',
        sectionLabel: 'Seller Trust Authority Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_trust_authority_pack,
        placeholderKeysText: 'seller_entity_type, seller_trust_registration_number, seller_trustee_names, seller_representative_name, seller_representative_capacity, seller_authority_basis',
        conditionJson: createConditionalPackCondition({
          field: 'seller_entity_type',
          operator: 'equals',
          value: 'trust',
          label: 'Only include for trust sellers',
        }),
        isRequired: false,
        sortOrder: 4,
      },
      {
        sectionKey: 'seller_spouse_consent_pack',
        sectionLabel: 'Seller Spouse Consent Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_spouse_consent_pack,
        placeholderKeysText: 'seller_spouse_consent_required, seller_spouse_full_name, seller_spouse_id_number, seller_spouse_email',
        conditionJson: createConditionalPackCondition({
          field: 'seller_spouse_consent_required',
          operator: 'equals',
          value: 'Yes',
          label: 'Only include when seller spouse consent is required',
        }),
        isRequired: false,
        sortOrder: 5,
      },
      {
        sectionKey: 'property_details',
        sectionLabel: 'Property Details',
        sectionType: 'dynamic_fields',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_details,
        placeholderKeysText: 'property_address, property_display_address, property_suburb, property_city, property_type, property_title_type',
        isRequired: true,
        sortOrder: 6,
      },
      {
        sectionKey: 'property_full_title_pack',
        sectionLabel: 'Full Title Property Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_full_title_pack,
        placeholderKeysText: 'property_title_type, erf_number, erf_size, floor_size, property_estate_name',
        conditionJson: createConditionalPackCondition({
          field: 'property_title_type',
          operator: 'in',
          value: 'full_title, agricultural_holding',
          label: 'Only include for full title properties',
        }),
        isRequired: false,
        sortOrder: 7,
      },
      {
        sectionKey: 'property_sectional_title_pack',
        sectionLabel: 'Sectional Title Property Pack',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_sectional_title_pack,
        placeholderKeysText: 'property_title_type, property_unit_number, property_section_number, sectional_title_number, property_complex_name, property_estate_name',
        conditionJson: createConditionalPackCondition({
          field: 'property_title_type',
          operator: 'in',
          value: 'sectional_title, share_block',
          label: 'Only include for sectional title or share block properties',
        }),
        isRequired: false,
        sortOrder: 8,
      },
      {
        sectionKey: 'mandate_terms',
        sectionLabel: 'Mandate Terms',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.mandate_terms,
        placeholderKeysText: 'mandate_type, mandate_start_date, mandate_end_date, mandate_introduction_purpose, mandate_authority_granted, mandate_access_instructions',
        isRequired: true,
        sortOrder: 9,
      },
      {
        sectionKey: 'commission_terms',
        sectionLabel: 'Commission Terms',
        sectionType: 'dynamic_fields',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.commission_terms,
        placeholderKeysText: 'commission_structure, mandate_commission_percent, mandate_commission_amount, vat_handling, asking_price',
        isRequired: true,
        sortOrder: 10,
      },
      {
        sectionKey: 'marketing_listing_terms',
        sectionLabel: 'Marketing / Listing Terms',
        sectionType: 'dynamic_fields',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.marketing_listing_terms,
        placeholderKeysText: 'mandate_marketing_permissions',
        isRequired: false,
        sortOrder: 11,
      },
      {
        sectionKey: 'special_conditions',
        sectionLabel: 'Special Conditions',
        sectionType: 'legal_text',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.special_conditions,
        placeholderKeysText: 'special_conditions, annexures_list',
        isRequired: false,
        sortOrder: 12,
      },
      {
        sectionKey: 'signature_pages',
        sectionLabel: 'Signature Pages',
        sectionType: 'signature_zone',
        legalText: SALES_MANDATE_DEFAULT_LEGAL_TEXT.signature_pages,
        placeholderKeysText: 'seller_full_name, seller_signature, seller_initials, signed_date, agent_full_name, organisation_name, agent_ffc_number, witness_signature, document_reference, transaction_reference, generated_date, template_version',
        isRequired: true,
        sortOrder: 13,
      },
    ]
  }

  if (normalized.startsWith('commercial_')) {
    const familyLabel = normalized === 'commercial_sale' ? 'Commercial Sales' : 'Commercial Leasing'
    return [
      {
        sectionKey: 'commercial_context',
        sectionLabel: 'Commercial Context',
        sectionType: 'dynamic_fields',
        legalText: 'Transaction type: {{transaction_type}}\nAsset category: {{asset_category}}\nTemplate family: ' + familyLabel,
        placeholderKeysText: 'transaction_type, asset_category',
        isRequired: true,
        sortOrder: 0,
      },
      {
        sectionKey: 'parties',
        sectionLabel: 'Parties',
        sectionType: 'dynamic_fields',
        legalText: 'Landlord / Owner Company: {{landlord_company_name}}\nAsset Manager: {{asset_manager_name}}\nBroker: {{broker_name}}',
        placeholderKeysText: 'landlord_company_name, asset_manager_name, broker_name',
        isRequired: true,
        sortOrder: 1,
      },
      {
        sectionKey: 'asset_details',
        sectionLabel: 'Asset Details',
        sectionType: 'dynamic_fields',
        legalText: 'Property: {{property_name}}\nAddress: {{property_address}}\nGLA / Area: {{gla}}\nRental per m²: {{rental_per_m2}}\nOperating Costs: {{office_operating_costs}}\nSale Price: {{sale_price}}',
        placeholderKeysText: 'property_name, property_address, gla, rental_per_m2, office_operating_costs, sale_price',
        isRequired: true,
        sortOrder: 2,
      },
      {
        sectionKey: 'commercial_terms',
        sectionLabel: 'Commercial Terms',
        sectionType: 'legal_text',
        legalText: 'Mandate type: {{mandate_type}}\nStart date: {{mandate_start_date}}\nExpiry date: {{mandate_expiry_date}}\nCommission: {{commission_percentage}}',
        placeholderKeysText: 'mandate_type, mandate_start_date, mandate_expiry_date, commission_percentage',
        isRequired: true,
        sortOrder: 3,
      },
      {
        sectionKey: 'signature_pages',
        sectionLabel: 'Signature Pages',
        sectionType: 'signature_zone',
        legalText: 'Signed by {{landlord_company_name}} through {{asset_manager_name}} and {{broker_name}}',
        placeholderKeysText: 'landlord_company_name, asset_manager_name, broker_name',
        isRequired: true,
        sortOrder: 4,
      },
    ]
  }

  return [
    {
      sectionKey: 'cover_page',
      sectionLabel: 'Cover Page',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.cover_page,
      placeholderKeysText: 'property_address, agent_full_name, organisation_name, document_reference, transaction_reference',
      isRequired: true,
      sortOrder: 0,
    },
    {
      sectionKey: 'schedule_1',
      sectionLabel: 'Schedule 1 - Transaction Particulars',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.schedule_1,
      placeholderKeysText: 'buyer_full_name, buyer_id_number, buyer_domicilium_address, buyer_email, buyer_phone, buyer_marital_status, buyer_entity_type, property_address, property_display_address, property_suburb, property_city, property_type, erf_number, property_unit_number, property_section_number, sectional_title_number, property_complex_name, property_estate_name, parking_bay, storeroom, property_nhbrc_certificate_number, purchase_price, deposit_amount, finance_type, bond_amount, cash_amount, additional_costs_note, suspensive_conditions, occupation_date, transfer_date, organisation_name, agency_legal_name, agency_registration_number, agency_vat_number, agency_address, agent_full_name, agent_email, agent_phone, agent_ffc_number, seller_full_name, seller_id_number, seller_entity_type, seller_domicilium_address, seller_email, seller_phone, attorney_firm_name, conveyancer_name, conveyancer_email, conveyancer_reference',
      isRequired: true,
      sortOrder: 1,
    },
    {
      sectionKey: 'buyer_individual_capacity_pack',
      sectionLabel: 'Buyer Individual Capacity Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.buyer_individual_capacity_pack,
      placeholderKeysText: 'buyer_entity_type, buyer_marital_status, buyer_spouse_consent_required',
      conditionJson: createConditionalPackCondition({
        field: 'buyer_entity_type',
        operator: 'equals',
        value: 'individual',
        label: 'Only include for individual buyers',
      }),
      isRequired: false,
      sortOrder: 2,
    },
    {
      sectionKey: 'buyer_company_authority_pack',
      sectionLabel: 'Buyer Company Authority Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.buyer_company_authority_pack,
      placeholderKeysText: 'buyer_entity_type, buyer_company_registration_number, buyer_representative_name, buyer_representative_capacity, buyer_resolution_date, buyer_authority_basis',
      conditionJson: createConditionalPackCondition({
        field: 'buyer_entity_type',
        operator: 'in',
        value: 'company, close_corporation',
        label: 'Only include for company or close corporation buyers',
      }),
      isRequired: false,
      sortOrder: 3,
    },
    {
      sectionKey: 'buyer_trust_authority_pack',
      sectionLabel: 'Buyer Trust Authority Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.buyer_trust_authority_pack,
      placeholderKeysText: 'buyer_entity_type, buyer_trust_registration_number, buyer_trustee_names, buyer_representative_name, buyer_representative_capacity, buyer_authority_basis',
      conditionJson: createConditionalPackCondition({
        field: 'buyer_entity_type',
        operator: 'equals',
        value: 'trust',
        label: 'Only include for trust buyers',
      }),
      isRequired: false,
      sortOrder: 4,
    },
    {
      sectionKey: 'buyer_spouse_consent_pack',
      sectionLabel: 'Buyer Spouse Consent Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.buyer_spouse_consent_pack,
      placeholderKeysText: 'buyer_spouse_consent_required, buyer_spouse_full_name, buyer_spouse_id_number, buyer_spouse_email',
      conditionJson: createConditionalPackCondition({
        field: 'buyer_spouse_consent_required',
        operator: 'equals',
        value: 'Yes',
        label: 'Only include when buyer spouse consent is required',
      }),
      isRequired: false,
      sortOrder: 5,
    },
    {
      sectionKey: 'seller_individual_capacity_pack',
      sectionLabel: 'Seller Individual Capacity Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.seller_individual_capacity_pack,
      placeholderKeysText: 'seller_entity_type, seller_marital_status, seller_spouse_consent_required',
      conditionJson: createConditionalPackCondition({
        field: 'seller_entity_type',
        operator: 'equals',
        value: 'individual',
        label: 'Only include for individual sellers',
      }),
      isRequired: false,
      sortOrder: 6,
    },
    {
      sectionKey: 'seller_company_authority_pack',
      sectionLabel: 'Seller Company Authority Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.seller_company_authority_pack,
      placeholderKeysText: 'seller_entity_type, seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis',
      conditionJson: createConditionalPackCondition({
        field: 'seller_entity_type',
        operator: 'in',
        value: 'company, close_corporation',
        label: 'Only include for company or close corporation sellers',
      }),
      isRequired: false,
      sortOrder: 7,
    },
    {
      sectionKey: 'seller_trust_authority_pack',
      sectionLabel: 'Seller Trust Authority Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.seller_trust_authority_pack,
      placeholderKeysText: 'seller_entity_type, seller_trust_registration_number, seller_trustee_names, seller_representative_name, seller_representative_capacity, seller_authority_basis',
      conditionJson: createConditionalPackCondition({
        field: 'seller_entity_type',
        operator: 'equals',
        value: 'trust',
        label: 'Only include for trust sellers',
      }),
      isRequired: false,
      sortOrder: 8,
    },
    {
      sectionKey: 'seller_spouse_consent_pack',
      sectionLabel: 'Seller Spouse Consent Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.seller_spouse_consent_pack,
      placeholderKeysText: 'seller_spouse_consent_required, seller_spouse_full_name, seller_spouse_id_number, seller_spouse_email',
      conditionJson: createConditionalPackCondition({
        field: 'seller_spouse_consent_required',
        operator: 'equals',
        value: 'Yes',
        label: 'Only include when seller spouse consent is required',
      }),
      isRequired: false,
      sortOrder: 9,
    },
    {
      sectionKey: 'schedule_2',
      sectionLabel: 'Bond Finance Pack - Bond Requirements',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.schedule_2,
      placeholderKeysText: 'buyer_initials, finance_type, bond_amount',
      conditionJson: createConditionalPackCondition({
        field: 'finance_type',
        operator: 'in',
        value: 'bond, combination',
        label: 'Only include when bond finance applies',
      }),
      isRequired: false,
      sortOrder: 10,
    },
    {
      sectionKey: 'cash_sale_pack',
      sectionLabel: 'Cash Sale Payment Pack',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.cash_sale_pack,
      placeholderKeysText: 'finance_type, cash_amount',
      conditionJson: createConditionalPackCondition({
        field: 'finance_type',
        operator: 'equals',
        value: 'cash',
        label: 'Only include for cash sale transactions',
      }),
      isRequired: false,
      sortOrder: 11,
    },
    {
      sectionKey: 'definitions',
      sectionLabel: 'Definitions',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.definitions,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 12,
    },
    {
      sectionKey: 'interpretation',
      sectionLabel: 'Interpretation',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.interpretation,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 13,
    },
    {
      sectionKey: 'sale_acceptance',
      sectionLabel: 'Sale and Acceptance',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.sale_acceptance,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 14,
    },
    {
      sectionKey: 'purchase_price',
      sectionLabel: 'Purchase Price',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.purchase_price,
      placeholderKeysText: 'purchase_price, deposit_amount, bond_amount, cash_amount',
      isRequired: true,
      sortOrder: 15,
    },
    {
      sectionKey: 'property_risk_transfer',
      sectionLabel: 'Property, Risk and Transfer',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.property_risk_transfer,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 16,
    },
    {
      sectionKey: 'occupation',
      sectionLabel: 'Occupation',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.occupation,
      placeholderKeysText: 'occupation_date',
      isRequired: true,
      sortOrder: 17,
    },
    {
      sectionKey: 'suspensive_conditions',
      sectionLabel: 'Suspensive Conditions',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.suspensive_conditions,
      placeholderKeysText: 'suspensive_conditions',
      isRequired: true,
      sortOrder: 18,
    },
    {
      sectionKey: 'warranties_capacity',
      sectionLabel: 'Warranties and Capacity',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.warranties_capacity,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 19,
    },
    {
      sectionKey: 'commission_certificates',
      sectionLabel: 'Commission and Certificates',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.commission_certificates,
      placeholderKeysText: 'gross_commission_percentage, gross_commission_amount, agency_commission_amount, agent_commission_amount',
      isRequired: true,
      sortOrder: 20,
    },
    {
      sectionKey: 'rates_breach_cooling',
      sectionLabel: 'Rates, Breach and Cooling Off',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.rates_breach_cooling,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 21,
    },
    {
      sectionKey: 'notices_jurisdiction_marital',
      sectionLabel: 'Notices, Jurisdiction and Marital Status',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.notices_jurisdiction_marital,
      placeholderKeysText: 'buyer_marital_status',
      isRequired: true,
      sortOrder: 22,
    },
    {
      sectionKey: 'special_conditions',
      sectionLabel: 'Special Conditions',
      sectionType: 'dynamic_fields',
      legalText: OTP_DEFAULT_LEGAL_TEXT.special_conditions,
      placeholderKeysText: 'special_conditions',
      isRequired: false,
      sortOrder: 23,
    },
    {
      sectionKey: 'costs_general_terms',
      sectionLabel: 'Costs and General Terms',
      sectionType: 'legal_text',
      legalText: OTP_DEFAULT_LEGAL_TEXT.costs_general_terms,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 24,
    },
    {
      sectionKey: 'signature_pages',
      sectionLabel: 'Signature Pages',
      sectionType: 'signature_zone',
      legalText: OTP_DEFAULT_LEGAL_TEXT.signature_pages,
      placeholderKeysText: 'buyer_full_name, buyer_signature, buyer_initials, signed_date, witness_signature, seller_full_name, seller_signature, seller_initials, organisation_name, agent_full_name, agent_ffc_number, buyer_phone, buyer_email, seller_phone, seller_email, agent_phone, agent_email, document_reference, transaction_reference, generated_date, template_version, annexures_list',
      isRequired: true,
      sortOrder: 25,
    },
  ]
}

function createStarterSections(packetType = 'otp') {
  const baseSections = createStarterBaseSections(packetType)
  return ['mandate', 'otp'].includes(normalizeText(packetType).toLowerCase())
    ? buildConditionalMasterTemplateSections(packetType, baseSections)
    : baseSections
}

function isDefaultLegalTemplatePacketType(packetType = '') {
  return Boolean(LEGAL_DEFAULT_TEMPLATE_DEFINITIONS[normalizeText(packetType).toLowerCase()])
}

function getDefaultLegalTemplateDefinition(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  return LEGAL_DEFAULT_TEMPLATE_DEFINITIONS[normalized] || LEGAL_DEFAULT_TEMPLATE_DEFINITIONS.otp
}

function createVirtualDefaultTemplateId(packetType = 'otp') {
  const normalized = isDefaultLegalTemplatePacketType(packetType)
    ? normalizeText(packetType).toLowerCase()
    : 'otp'
  return `${VIRTUAL_DEFAULT_TEMPLATE_ID_PREFIX}:${normalized}`
}

function isVirtualDefaultTemplateId(templateId = '') {
  return normalizeText(templateId).startsWith(`${VIRTUAL_DEFAULT_TEMPLATE_ID_PREFIX}:`)
}

function getPacketTypeFromVirtualDefaultTemplateId(templateId = '') {
  const [, packetType = ''] = normalizeText(templateId).split(':')
  return isDefaultLegalTemplatePacketType(packetType) ? packetType : ''
}

function createDefaultLegalTemplateRecord(packetType = 'otp', {
  moduleType = 'agency',
  virtual = false,
  updatedAt = '',
} = {}) {
  const normalizedPacketType = isDefaultLegalTemplatePacketType(packetType)
    ? normalizeText(packetType).toLowerCase()
    : 'otp'
  const definition = getDefaultLegalTemplateDefinition(normalizedPacketType)
  const renderMode = getDefaultRenderMode(normalizedPacketType)
  const timestamp = normalizeText(updatedAt) || '2026-05-11T00:00:00.000Z'
  const starterSections = createStarterSections(normalizedPacketType)
  const conditionalMasterDefinition = getConditionalMasterTemplateDefinition(normalizedPacketType)
  const validationMetadata = {
    renderable: true,
    isRenderable: true,
    blockingIssues: [],
    warnings: [],
    sectionCount: starterSections.length,
    tokenCount: starterSections.reduce((count, section) => {
      const tokens = new Set([
        ...String(section.placeholderKeysText || '')
          .split(',')
          .map((item) => normalizeTemplateTokenKey(item))
          .filter(Boolean),
        ...detectTemplateTokenIssues(section.legalText).tokens.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
      ])
      return count + tokens.size
    }, 0),
    validatedAt: timestamp,
  }

  return {
    id: virtual ? createVirtualDefaultTemplateId(normalizedPacketType) : '',
    organisation_id: null,
    module_type: normalizeText(moduleType || 'agency').toLowerCase() || 'agency',
    packet_type: normalizedPacketType,
    template_key: definition.templateKey,
    template_label: definition.templateLabel,
    template_format: getTemplateFormatForMode(renderMode),
    template_storage_bucket: null,
    template_storage_path: null,
    template_file_name: null,
    version_tag: 'v1',
    description: definition.description,
    status: 'published',
    is_default: true,
    is_active: true,
    metadata_json: {
      template_scope: virtual ? 'runtime_default' : 'global_default',
      document_family: normalizedPacketType,
      preview_layout: 'three_panel_packet',
      render_mode: renderMode,
      native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
      starter_template: ARCH9_DEFAULT_TEMPLATE_STARTER,
      template_family: STANDARD_LEGAL_TEMPLATE_FAMILY,
      default_template_source: LEGAL_DEFAULT_TEMPLATE_SOURCE,
      editable_copy_mode: 'auto_agency_version',
      lifecycle_status: 'published',
      document_kind: 'standard',
      documentKind: 'standard',
      preferred_document_kind: 'standard',
      document_kind_label: 'Standard document',
      ...(conditionalMasterDefinition
        ? {
            conditional_master: true,
            conditional_master_version: conditionalMasterDefinition.masterVersion,
            scenario_resolver_version: conditionalMasterDefinition.resolverVersion,
            core_condition_rules_locked: true,
            conditional_pack_keys: conditionalMasterDefinition.packKeys,
            default_signer_roles: conditionalMasterDefinition.defaultSignerRoles,
          }
        : {}),
      ...(normalizedPacketType === 'mandate'
        ? {
            mandate_template_variant: 'default',
            mandateTemplateVariant: 'default',
            mandate_template_variants: ['default'],
          }
        : {}),
      last_render_validation: validationMetadata,
    },
    created_at: timestamp,
    updated_at: timestamp,
    published_at: timestamp,
    sections: starterSections,
  }
}

function hasNormalLegalTemplate(rows = []) {
  return (Array.isArray(rows) ? rows : []).some((template) => !isTemplatePickerCustomTemplate(template))
}

function withDefaultLegalTemplateStarter(rows = [], packetType = 'otp', moduleType = 'agency') {
  const list = Array.isArray(rows) ? rows : []
  if (
    normalizeText(moduleType).toLowerCase() !== 'agency' ||
    !isDefaultLegalTemplatePacketType(packetType) ||
    hasNormalLegalTemplate(list)
  ) {
    return list
  }
  return [
    ...list,
    createDefaultLegalTemplateRecord(packetType, {
      moduleType,
      virtual: true,
    }),
  ]
}

function createGeneralAddendumStarterSections(packetType = 'otp', starterKind = GENERAL_ADDENDUM_TEMPLATE_FAMILY) {
  const normalized = normalizeText(packetType).toLowerCase()
  const isMandate = normalized === 'mandate'
  const starter = getAddendumTemplateStarter(starterKind) || getAddendumTemplateStarter(GENERAL_ADDENDUM_TEMPLATE_FAMILY)

  return [
    {
      sectionKey: 'addendum_cover',
      sectionLabel: 'Addendum Details',
      sectionType: 'dynamic_fields',
      legalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.cover_page,
      placeholderKeysText: 'property_address, document_reference, transaction_reference, generated_date, template_version',
      isRequired: true,
      sortOrder: 0,
    },
    {
      sectionKey: 'addendum_parties',
      sectionLabel: 'Parties',
      sectionType: 'dynamic_fields',
      legalText: isMandate
        ? GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.mandate_parties
        : GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.otp_parties,
      placeholderKeysText: isMandate
        ? 'seller_full_name, agency_legal_name, agent_full_name'
        : 'buyer_full_name, seller_full_name, agency_legal_name, agent_full_name',
      isRequired: true,
      sortOrder: 1,
    },
    {
      sectionKey: 'linked_document',
      sectionLabel: 'Linked Document',
      sectionType: 'legal_text',
      legalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.linked_document,
      placeholderKeysText: '',
      isRequired: true,
      sortOrder: 2,
    },
    {
      sectionKey: 'agreed_addendum_terms',
      sectionLabel: starter.termsSectionLabel,
      sectionType: 'dynamic_fields',
      legalText: starter.termsLegalText,
      placeholderKeysText: starter.placeholderKeysText,
      isRequired: true,
      sortOrder: 3,
    },
    {
      sectionKey: 'unchanged_terms',
      sectionLabel: 'Unchanged Terms',
      sectionType: 'legal_text',
      legalText: GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.unchanged_terms,
      placeholderKeysText: 'annexures_list',
      isRequired: true,
      sortOrder: 4,
    },
    {
      sectionKey: 'signature_pages',
      sectionLabel: 'Signature Pages',
      sectionType: 'signature_zone',
      legalText: isMandate
        ? GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.mandate_signatures
        : GENERAL_ADDENDUM_DEFAULT_LEGAL_TEXT.otp_signatures,
      placeholderKeysText: isMandate
        ? 'seller_full_name, seller_signature, seller_initials, signed_date, witness_signature, organisation_name, agent_full_name, agent_ffc_number'
        : 'buyer_full_name, buyer_signature, buyer_initials, seller_full_name, seller_signature, seller_initials, signed_date, witness_signature, organisation_name, agent_full_name, agent_ffc_number',
      isRequired: true,
      signingFields: isMandate
        ? [
            { id: 'seller_signature', signerRole: 'seller', fieldType: 'signature', pageNumber: 1, xPosition: 70, yPosition: 692, width: 168, height: 44, required: true, label: 'Seller signature' },
            { id: 'seller_date', signerRole: 'seller', fieldType: 'date', pageNumber: 1, xPosition: 260, yPosition: 692, width: 82, height: 22, required: true, label: 'Seller date' },
            { id: 'witness_signature', signerRole: 'witness_1', fieldType: 'signature', pageNumber: 1, xPosition: 70, yPosition: 758, width: 168, height: 44, required: false, label: 'Witness signature' },
          ]
        : [
            { id: 'buyer_signature', signerRole: 'purchaser_1', fieldType: 'signature', pageNumber: 1, xPosition: 70, yPosition: 654, width: 168, height: 44, required: true, label: 'Buyer signature' },
            { id: 'buyer_date', signerRole: 'purchaser_1', fieldType: 'date', pageNumber: 1, xPosition: 260, yPosition: 654, width: 82, height: 22, required: true, label: 'Buyer date' },
            { id: 'seller_signature', signerRole: 'seller', fieldType: 'signature', pageNumber: 1, xPosition: 70, yPosition: 726, width: 168, height: 44, required: true, label: 'Seller signature' },
            { id: 'seller_date', signerRole: 'seller', fieldType: 'date', pageNumber: 1, xPosition: 260, yPosition: 726, width: 82, height: 22, required: true, label: 'Seller date' },
            { id: 'witness_signature', signerRole: 'witness_1', fieldType: 'signature', pageNumber: 1, xPosition: 374, yPosition: 726, width: 168, height: 44, required: false, label: 'Witness signature' },
          ],
      sortOrder: 5,
    },
  ]
}

function getTemplateRenderValidation(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return metadata.last_render_validation && typeof metadata.last_render_validation === 'object'
    ? metadata.last_render_validation
    : {}
}

function hasExplicitTemplateRenderMode(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return Boolean(normalizeText(metadata.render_mode || metadata.renderMode || template?.render_mode || template?.renderMode))
}

function classifyTemplateMigrationState(template = null, packetType = 'mandate') {
  const renderMode = normalizeTemplateRenderMode(template, packetType)
  const validation = getTemplateRenderValidation(template)
  const renderable = validation.renderable === true || validation.isRenderable === true
  const explicitRenderMode = hasExplicitTemplateRenderMode(template)

  if (renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
    return {
      key: renderable ? 'structured_ready_native' : 'structured_incomplete',
      renderMode,
      renderable,
      explicitRenderMode,
      label: renderable ? 'Structured-ready native' : 'Structured-incomplete',
    }
  }

  return {
    key: 'legacy_docx_only',
    renderMode,
    renderable: templateHasLegacySource(template),
    explicitRenderMode,
    label: 'Legacy DOCX only',
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function createTemplateKeySegment(value = 'template') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'template'
}

function normalizeMandateTemplateRoute(value = '') {
  const normalized = createTemplateKeySegment(value)
  return normalized === 'template' ? 'default' : normalized
}

function getMandateTemplateRouteLabel(value = '') {
  const normalized = normalizeMandateTemplateRoute(value)
  return MANDATE_TEMPLATE_ROUTE_OPTIONS.find((option) => option.key === normalized)?.label || 'All mandate situations'
}

function getMandateTemplateRouteFromTemplate(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
  return normalizeMandateTemplateRoute(
    metadata.mandate_template_variant ||
      metadata.mandateTemplateVariant ||
      metadata.template_variant ||
      metadata.templateVariant ||
      '',
  )
}

function normalizeLegalRouteTarget(value = '', allowedOptions = []) {
  const normalized = createTemplateKeySegment(value)
  return allowedOptions.some((option) => option.key === normalized) ? normalized : 'any'
}

function getFirstLegalRouteMetadataValue(metadata = {}, keys = []) {
  for (const key of keys) {
    const value = Array.isArray(metadata?.[key]) ? metadata[key][0] : metadata?.[key]
    if (normalizeText(value)) return value
  }
  return ''
}

function buildOtpLegalScenarioKey(form = {}) {
  const seller = normalizeLegalRouteTarget(form.legalSellerClauseProfile, LEGAL_PARTY_ROUTE_OPTIONS)
  const buyer = normalizeLegalRouteTarget(form.legalBuyerClauseProfile, LEGAL_PARTY_ROUTE_OPTIONS)
  const property = normalizeLegalRouteTarget(form.legalPropertyClauseProfile, LEGAL_PROPERTY_ROUTE_OPTIONS)
  const finance = normalizeLegalRouteTarget(form.legalFinanceClauseProfile, LEGAL_FINANCE_ROUTE_OPTIONS)
  if ([seller, buyer, property, finance].includes('any')) return ''
  return `${seller}_seller__${buyer}_buyer__${property}__${finance}`
}

function getLegalRouteOptionLabel(options = [], value = '') {
  const normalized = normalizeLegalRouteTarget(value, options)
  return options.find((option) => option.key === normalized)?.label || options[0]?.label || 'Any'
}

function getOtpLegalRouteSummary(form = {}) {
  const values = [
    getLegalRouteOptionLabel(LEGAL_PARTY_ROUTE_OPTIONS, form.legalSellerClauseProfile),
    getLegalRouteOptionLabel(LEGAL_PARTY_ROUTE_OPTIONS, form.legalBuyerClauseProfile),
    getLegalRouteOptionLabel(LEGAL_PROPERTY_ROUTE_OPTIONS, form.legalPropertyClauseProfile),
    getLegalRouteOptionLabel(LEGAL_FINANCE_ROUTE_OPTIONS, form.legalFinanceClauseProfile),
  ]
  return values.every((value) => value.startsWith('Any ')) ? 'All OTP situations' : values.join(' · ')
}

function getOtpCoverageEntrySummary(entry = {}) {
  if (entry.isGeneric) return 'All OTP situations (fallback)'
  const metadata = entry.metadata || {}
  const labelFor = (options, values, anyLabel) => (
    Array.isArray(values) && values.length
      ? values.map((value) => getLegalRouteOptionLabel(options, value)).join(' or ')
      : anyLabel
  )
  return [
    labelFor(LEGAL_PARTY_ROUTE_OPTIONS, metadata.sellerProfiles, 'Any seller'),
    labelFor(LEGAL_PARTY_ROUTE_OPTIONS, metadata.buyerProfiles, 'Any buyer'),
    labelFor(LEGAL_PROPERTY_ROUTE_OPTIONS, metadata.propertyProfiles, 'Any property'),
    labelFor(LEGAL_FINANCE_ROUTE_OPTIONS, metadata.financeProfiles, 'Any finance'),
  ].join(' · ')
}

function getMandateVariantTemplateLabel(baseLabel = 'Mandate Agreement', routeKey = 'default') {
  const routeLabel = getMandateTemplateRouteLabel(routeKey)
  if (normalizeMandateTemplateRoute(routeKey) === 'default') return normalizeText(baseLabel) || 'Mandate Agreement'
  return `${routeLabel} Mandate`
}

function isLiveTemplateStatus(status = '') {
  return ['active', 'published', 'approved', 'live'].includes(normalizeText(status).toLowerCase())
}

function getTemplateMetadata(template = null) {
  return template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
}

function getTemplateDocumentKind(template = null) {
  const metadata = getTemplateMetadata(template)
  return getDocumentKindOption(
    metadata.document_kind ||
      metadata.documentKind ||
      metadata.preferred_document_kind ||
      metadata.preferredDocumentKind ||
      'standard',
  )
}

function isTemplatePickerCustomTemplate(template = null) {
  const metadata = getTemplateMetadata(template)
  const starter = normalizeText(metadata.starter_template || metadata.starterTemplate).toLowerCase()
  const family = normalizeText(metadata.template_family || metadata.templateFamily).toLowerCase()
  const documentKind = getTemplateDocumentKind(template).key
  return starter === BLANK_CANVAS_TEMPLATE_STARTER ||
    family === CUSTOM_TEMPLATE_FAMILY ||
    family === GENERAL_ADDENDUM_TEMPLATE_FAMILY ||
    ['addendum', 'amendment', 'annexure', 'custom'].includes(documentKind)
}

function getPrimaryTemplateForPicker(templates = []) {
  const list = Array.isArray(templates) ? templates : []
  const primaryTemplates = list.filter((template) => !isTemplatePickerCustomTemplate(template))
  return primaryTemplates.find((template) => Boolean(template?.organisation_id) && Boolean(template?.is_default))
    || primaryTemplates.find((template) => Boolean(template?.organisation_id))
    || primaryTemplates.find((template) => Boolean(template?.is_default))
    || primaryTemplates[0]
    || list[0]
    || null
}

function createBlankTemplateForm(packetType = 'otp') {
  return {
    templateLabel: '',
    packetType: normalizeText(packetType).toLowerCase() || 'otp',
    documentKind: 'custom',
    description: '',
  }
}

function createBlankCanvasSections() {
  return [
    {
      sectionKey: 'blank_page',
      sectionLabel: 'Blank Page',
      sectionType: 'legal_text',
      legalText: '',
      placeholderKeysText: '',
      isRequired: false,
      sortOrder: 0,
    },
  ]
}

function normalizeTemplateTokenKey(value = '') {
  const key = normalizeText(value)
  return TEMPLATE_TOKEN_REPLACEMENTS[key] || key
}

function normalizeSectionSigningRequirement(value = '', { requiresInitial = false, requiresSignature = false } = {}) {
  const key = normalizeText(value).toLowerCase()
  if (key === 'client_signature' || key === 'signature' || key === 'full_signature') return 'client_signature'
  if (key === 'client_initial' || key === 'initial' || key === 'initials') return 'client_initial'
  if (requiresSignature) return 'client_signature'
  if (requiresInitial) return 'client_initial'
  return 'none'
}

function getDefaultClientSigningPlaceholderKey(packetType = 'otp', requirement = 'client_initial') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const partyPrefix = normalizedPacketType === 'mandate' ? 'seller' : 'buyer'
  return requirement === 'client_signature' ? `${partyPrefix}_signature` : `${partyPrefix}_initials`
}

function normalizeTemplateLegalText(value = '') {
  return String(value || '').replace(/{{\s*([^{}]+?)\s*}}/g, (match, token) => {
    const normalizedToken = normalizeTemplateTokenKey(token)
    return normalizedToken ? `{{${normalizedToken}}}` : match
  })
}

function getDefaultSectionLegalText(packetType = 'otp', section = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const sectionKey = normalizeText(section.section_key || section.sectionKey || section.key).toLowerCase()
  const sectionLabel = normalizeText(section.section_label || section.sectionLabel || section.label).toLowerCase()
  const lookupKey = sectionKey || sectionLabel

  const otpDefaults = {
    cover_page: OTP_DEFAULT_LEGAL_TEXT.cover_page,
    schedule_1: OTP_DEFAULT_LEGAL_TEXT.schedule_1,
    schedule_2: OTP_DEFAULT_LEGAL_TEXT.schedule_2,
    cash_sale_pack: OTP_DEFAULT_LEGAL_TEXT.cash_sale_pack,
    buyer_individual_capacity_pack: OTP_DEFAULT_LEGAL_TEXT.buyer_individual_capacity_pack,
    buyer_company_authority_pack: OTP_DEFAULT_LEGAL_TEXT.buyer_company_authority_pack,
    buyer_trust_authority_pack: OTP_DEFAULT_LEGAL_TEXT.buyer_trust_authority_pack,
    buyer_spouse_consent_pack: OTP_DEFAULT_LEGAL_TEXT.buyer_spouse_consent_pack,
    seller_individual_capacity_pack: OTP_DEFAULT_LEGAL_TEXT.seller_individual_capacity_pack,
    seller_company_authority_pack: OTP_DEFAULT_LEGAL_TEXT.seller_company_authority_pack,
    seller_trust_authority_pack: OTP_DEFAULT_LEGAL_TEXT.seller_trust_authority_pack,
    seller_spouse_consent_pack: OTP_DEFAULT_LEGAL_TEXT.seller_spouse_consent_pack,
    definitions: OTP_DEFAULT_LEGAL_TEXT.definitions,
    interpretation: OTP_DEFAULT_LEGAL_TEXT.interpretation,
    sale_acceptance: OTP_DEFAULT_LEGAL_TEXT.sale_acceptance,
    purchase_price: OTP_DEFAULT_LEGAL_TEXT.purchase_price,
    property_risk_transfer: OTP_DEFAULT_LEGAL_TEXT.property_risk_transfer,
    occupation: OTP_DEFAULT_LEGAL_TEXT.occupation,
    warranties_capacity: OTP_DEFAULT_LEGAL_TEXT.warranties_capacity,
    commission_certificates: OTP_DEFAULT_LEGAL_TEXT.commission_certificates,
    rates_breach_cooling: OTP_DEFAULT_LEGAL_TEXT.rates_breach_cooling,
    notices_jurisdiction_marital: OTP_DEFAULT_LEGAL_TEXT.notices_jurisdiction_marital,
    costs_general_terms: OTP_DEFAULT_LEGAL_TEXT.costs_general_terms,
    buyer_details: OTP_DEFAULT_LEGAL_TEXT.buyer_details,
    seller_details: OTP_DEFAULT_LEGAL_TEXT.seller_details,
    property_details: OTP_DEFAULT_LEGAL_TEXT.property_details,
    purchase_terms: OTP_DEFAULT_LEGAL_TEXT.purchase_terms,
    occupation_transfer: OTP_DEFAULT_LEGAL_TEXT.occupation_transfer,
    suspensive_conditions: OTP_DEFAULT_LEGAL_TEXT.suspensive_conditions,
    seller_warranties: OTP_DEFAULT_LEGAL_TEXT.seller_warranties,
    commission_terms: OTP_DEFAULT_LEGAL_TEXT.commission_terms,
    costs_transfer: OTP_DEFAULT_LEGAL_TEXT.costs_transfer,
    special_conditions: OTP_DEFAULT_LEGAL_TEXT.special_conditions,
    general_legal_provisions: OTP_DEFAULT_LEGAL_TEXT.general_legal_provisions,
    signature_pages: OTP_DEFAULT_LEGAL_TEXT.signature_pages,
    parties: OTP_DEFAULT_LEGAL_TEXT.buyer_details,
    terms: OTP_DEFAULT_LEGAL_TEXT.purchase_terms,
    signatures: OTP_DEFAULT_LEGAL_TEXT.signature_pages,
  }

  const mandateDefaults = {
    introduction_purpose: SALES_MANDATE_DEFAULT_LEGAL_TEXT.introduction_purpose,
    parties: SALES_MANDATE_DEFAULT_LEGAL_TEXT.parties,
    seller_individual_capacity_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_individual_capacity_pack,
    seller_company_authority_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_company_authority_pack,
    seller_trust_authority_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_trust_authority_pack,
    seller_spouse_consent_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.seller_spouse_consent_pack,
    property_details: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_details,
    property_full_title_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_full_title_pack,
    property_sectional_title_pack: SALES_MANDATE_DEFAULT_LEGAL_TEXT.property_sectional_title_pack,
    mandate_terms: SALES_MANDATE_DEFAULT_LEGAL_TEXT.mandate_terms,
    commission_terms: SALES_MANDATE_DEFAULT_LEGAL_TEXT.commission_terms,
    marketing_listing_terms: SALES_MANDATE_DEFAULT_LEGAL_TEXT.marketing_listing_terms,
    special_conditions: SALES_MANDATE_DEFAULT_LEGAL_TEXT.special_conditions,
    signature_pages: SALES_MANDATE_DEFAULT_LEGAL_TEXT.signature_pages,
  }

  const defaults = normalizedPacketType === 'mandate' ? mandateDefaults : otpDefaults
  return defaults[lookupKey] || defaults[sectionLabel] || ''
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeTemplateStatus(template = {}) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const fromMetadata = normalizeText(metadata.lifecycle_status || metadata.template_status).toLowerCase()
  if (fromMetadata) return fromMetadata
  if (template?.is_active === false) return 'archived'
  return template?.is_default ? 'active' : 'draft'
}

function detectTemplateTokenIssues(text = '') {
  const value = String(text || '')
  const openMatches = value.match(/{{/g) || []
  const closeMatches = value.match(/}}/g) || []
  const malformed = []

  const tokenMatches = [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
  const tokens = tokenMatches
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)

  if (openMatches.length !== closeMatches.length) {
    malformed.push('Unbalanced placeholder braces detected.')
  }

  for (const token of tokens) {
    if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
      malformed.push(`Placeholder "${token}" contains unsupported characters.`)
    }
  }

  return {
    tokens,
    malformed,
  }
}

function sectionsFromTemplate(template = null) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  const packetType = normalizeText(template?.packet_type || template?.packetType || template?.metadata_json?.packet_type || template?.metadata_json?.packetType || 'otp')
  return sections.map((section, index) => {
    const savedLegalText = normalizeTemplateLegalText(section.legal_text || section.legalText || '')
    const legalText = savedLegalText || normalizeTemplateLegalText(getDefaultSectionLegalText(packetType, section))
    const metadata = section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : section?.metadataJson && typeof section.metadataJson === 'object'
        ? section.metadataJson
        : {}
    const signingMetadata = metadata.signing && typeof metadata.signing === 'object' ? metadata.signing : {}
    const tokenScan = detectTemplateTokenIssues(legalText)
    const placeholderKeysFromSection = Array.isArray(section.placeholder_keys)
      ? section.placeholder_keys
      : Array.isArray(section.placeholderKeys)
        ? section.placeholderKeys
        : []

    const allPlaceholderKeys = Array.from(
      new Set([
        ...placeholderKeysFromSection.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
        ...tokenScan.tokens.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
      ]),
    )

    const requiresInitial = Boolean(section.requiresInitial ?? section.requires_initial ?? metadata.requiresInitial ?? metadata.requires_initial ?? signingMetadata.requiresInitial ?? signingMetadata.requires_initial)
    const requiresSignature = Boolean(section.requiresSignature ?? section.requires_signature ?? metadata.requiresSignature ?? metadata.requires_signature ?? signingMetadata.requiresSignature ?? signingMetadata.requires_signature)
    const signingRequirement = normalizeSectionSigningRequirement(
      section.signingRequirement || section.signing_requirement || metadata.signingRequirement || metadata.signing_requirement || signingMetadata.signingRequirement || signingMetadata.signing_requirement,
      { requiresInitial, requiresSignature },
    )
    const signingFields = getSigningFieldsFromMetadata(metadata, section)

    return {
      id: section.id || null,
      sectionKey: normalizeText(section.section_key || section.sectionKey || `section_${index + 1}`),
      sectionLabel: normalizeText(section.section_label || section.sectionLabel || `Section ${index + 1}`),
      sectionType: normalizeText(section.section_type || section.sectionType || 'legal_text') || 'legal_text',
      legalText,
      placeholderKeys: allPlaceholderKeys,
      placeholderKeysText: allPlaceholderKeys.join(', '),
      isRequired: section.is_required === undefined ? true : Boolean(section.is_required),
      signingRequirement,
      requiresInitial: signingRequirement === 'client_initial',
      requiresSignature: signingRequirement === 'client_signature',
      signingRole: normalizeText(section.signingRole || section.signing_role || metadata.signingRole || metadata.signing_role || signingMetadata.signingRole || signingMetadata.signing_role || 'client') || 'client',
      initialPlaceholderKey: normalizeText(section.initialPlaceholderKey || section.initial_placeholder_key || metadata.initialPlaceholderKey || metadata.initial_placeholder_key || signingMetadata.initialPlaceholderKey || signingMetadata.initial_placeholder_key),
      signaturePlaceholderKey: normalizeText(section.signaturePlaceholderKey || section.signature_placeholder_key || metadata.signaturePlaceholderKey || metadata.signature_placeholder_key || signingMetadata.signaturePlaceholderKey || signingMetadata.signature_placeholder_key),
      signingFields,
      conditionJson: section.condition_json && typeof section.condition_json === 'object'
        ? section.condition_json
        : section.conditionJson && typeof section.conditionJson === 'object'
          ? section.conditionJson
          : {},
      metadataJson: metadata,
      sortOrder: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : index,
    }
  })
}

function toTemplateForm(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const packetType = normalizeText(template?.packet_type || template?.packetType || metadata?.packet_type || metadata?.packetType || 'otp')
  const renderMode = normalizeTemplateRenderMode(template, packetType) || getDefaultRenderMode(packetType)

  return {
    templateLabel: normalizeText(template?.template_label || template?.templateLabel),
    description: String(template?.description || ''),
    versionTag: normalizeText(template?.version_tag || template?.versionTag || 'v1') || 'v1',
    renderMode,
    templateFormat: normalizeText(template?.template_format || template?.templateFormat || getTemplateFormatForMode(renderMode)) || getTemplateFormatForMode(renderMode),
    templateStoragePath:
      normalizeText(template?.template_storage_path || metadata.template_storage_path || metadata.templatePath || ''),
    templateStorageBucket:
      normalizeText(template?.template_storage_bucket || metadata.template_storage_bucket || metadata.templateBucket || ''),
    templateFileName:
      normalizeText(template?.template_file_name || metadata.template_file_name || metadata.templateFilename || ''),
    templateOutputBucket:
      normalizeText(template?.template_output_bucket || metadata.template_output_bucket || metadata.outputBucket || ''),
    templateStatus: normalizeTemplateStatus(template),
    isActive: template?.is_active === undefined ? true : Boolean(template?.is_active),
    isDefault: Boolean(template?.is_default),
    mandateTemplateVariant: normalizeMandateTemplateRoute(
      metadata.mandate_template_variant ||
        metadata.mandateTemplateVariant ||
        metadata.template_variant ||
        metadata.templateVariant ||
        '',
    ),
    legalSellerClauseProfile: normalizeLegalRouteTarget(
      getFirstLegalRouteMetadataValue(metadata, ['seller_clause_profile', 'sellerClauseProfile', 'seller_clause_profiles']),
      LEGAL_PARTY_ROUTE_OPTIONS,
    ),
    legalBuyerClauseProfile: normalizeLegalRouteTarget(
      getFirstLegalRouteMetadataValue(metadata, ['buyer_clause_profile', 'buyerClauseProfile', 'buyer_clause_profiles']),
      LEGAL_PARTY_ROUTE_OPTIONS,
    ),
    legalPropertyClauseProfile: normalizeLegalRouteTarget(
      getFirstLegalRouteMetadataValue(metadata, ['property_clause_profile', 'propertyClauseProfile', 'property_clause_profiles']),
      LEGAL_PROPERTY_ROUTE_OPTIONS,
    ),
    legalFinanceClauseProfile: normalizeLegalRouteTarget(
      getFirstLegalRouteMetadataValue(metadata, ['finance_clause_profile', 'financeClauseProfile', 'finance_clause_profiles']),
      LEGAL_FINANCE_ROUTE_OPTIONS,
    ),
    sections: sectionsFromTemplate(template),
    metadataJson: metadata,
  }
}

function mapSectionForSave(section = {}, index = 0, packetType = 'otp') {
  const placeholderKeys = String(section.placeholderKeysText || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
  const metadataJson = section.metadataJson && typeof section.metadataJson === 'object' ? section.metadataJson : {}
  const signingRequirement = normalizeSectionSigningRequirement(section.signingRequirement, {
    requiresInitial: Boolean(section.requiresInitial),
    requiresSignature: Boolean(section.requiresSignature),
  })
  const requiresInitial = signingRequirement === 'client_initial'
  const requiresSignature = signingRequirement === 'client_signature'
  const initialPlaceholderKey = normalizeText(section.initialPlaceholderKey) || (requiresInitial ? getDefaultClientSigningPlaceholderKey(packetType, 'client_initial') : '')
  const signaturePlaceholderKey = normalizeText(section.signaturePlaceholderKey) || (requiresSignature ? getDefaultClientSigningPlaceholderKey(packetType, 'client_signature') : '')
  const signingRole = normalizeText(section.signingRole || 'client') || 'client'
  const signingFields = getSigningFieldsFromMetadata(metadataJson, section)

  return {
    sectionKey: normalizeText(section.sectionKey || `section_${index + 1}`),
    sectionLabel: normalizeText(section.sectionLabel || `Section ${index + 1}`),
    sectionType: normalizeText(section.sectionType || 'legal_text') || 'legal_text',
    legalText: String(section.legalText || ''),
    placeholderKeys,
    isRequired: section.isRequired === undefined ? true : Boolean(section.isRequired),
    conditionJson: section.conditionJson && typeof section.conditionJson === 'object'
      ? section.conditionJson
      : section.condition_json && typeof section.condition_json === 'object'
        ? section.condition_json
        : {},
    metadataJson: {
      ...metadataJson,
      signing: {
        ...(metadataJson.signing && typeof metadataJson.signing === 'object' ? metadataJson.signing : {}),
        signing_requirement: signingRequirement,
        signing_role: signingRole,
        requires_initial: requiresInitial,
        initial_placeholder_key: initialPlaceholderKey,
        requires_signature: requiresSignature,
        signature_placeholder_key: signaturePlaceholderKey,
        planned_fields: signingFields,
        signing_fields: signingFields,
      },
      signing_requirement: signingRequirement,
      signing_role: signingRole,
      requires_initial: requiresInitial,
      initial_placeholder_key: initialPlaceholderKey,
      requires_signature: requiresSignature,
      signature_placeholder_key: signaturePlaceholderKey,
      planned_signing_fields: signingFields,
    },
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : index,
  }
}

function mapSectionForPreview(section = {}, index = 0, packetType = 'otp') {
  const savedSection = mapSectionForSave(section, index, packetType)
  return {
    ...savedSection,
    id: section.id || null,
    section_key: savedSection.sectionKey,
    section_label: savedSection.sectionLabel,
    section_type: savedSection.sectionType,
    legal_text: savedSection.legalText,
    placeholder_keys: savedSection.placeholderKeys,
    is_required: savedSection.isRequired,
    metadata_json: savedSection.metadataJson,
    sort_order: savedSection.sortOrder,
    condition_json: section.conditionJson || section.condition_json || null,
  }
}

function buildPreviewTemplateFromForm({
  selectedTemplate = null,
  templateDetail = null,
  form = {},
  packetType = 'otp',
  moduleType = 'agency',
  validationSummary = null,
} = {}) {
  const baseTemplate = templateDetail || selectedTemplate || {}
  const metadataJson = buildTemplateMetadata({ ...form, packetType, validationSummary }, form.metadataJson || {}, null)
  const renderMode = normalizeText(form.renderMode || TEMPLATE_RENDER_MODES.LEGACY_DOCX) || TEMPLATE_RENDER_MODES.LEGACY_DOCX
  return {
    ...baseTemplate,
    id: baseTemplate.id || selectedTemplate?.id || `preview-${packetType}`,
    packet_type: packetType,
    packetType,
    module_type: moduleType,
    moduleType,
    template_label: normalizeText(form.templateLabel || baseTemplate.template_label || baseTemplate.templateLabel),
    templateLabel: normalizeText(form.templateLabel || baseTemplate.template_label || baseTemplate.templateLabel),
    description: String(form.description || baseTemplate.description || ''),
    version_tag: normalizeText(form.versionTag || baseTemplate.version_tag || baseTemplate.versionTag || 'v1') || 'v1',
    versionTag: normalizeText(form.versionTag || baseTemplate.version_tag || baseTemplate.versionTag || 'v1') || 'v1',
    template_status: normalizeText(form.templateStatus || baseTemplate.template_status || baseTemplate.status || 'draft') || 'draft',
    template_format: getTemplateFormatForMode(renderMode),
    template_storage_bucket: normalizeText(form.templateStorageBucket || baseTemplate.template_storage_bucket),
    template_storage_path: normalizeText(form.templateStoragePath || baseTemplate.template_storage_path),
    template_file_name: normalizeText(form.templateFileName || baseTemplate.template_file_name),
    metadata_json: metadataJson,
    metadataJson,
    is_active: form.isActive === undefined ? Boolean(baseTemplate.is_active) : Boolean(form.isActive),
    is_default: form.isDefault === undefined ? Boolean(baseTemplate.is_default) : Boolean(form.isDefault),
    sections: (form.sections || []).map((section, index) => mapSectionForPreview(section, index, packetType)),
  }
}

function templateSort(left, right) {
  const leftOrg = Boolean(left?.organisation_id)
  const rightOrg = Boolean(right?.organisation_id)
  if (leftOrg !== rightOrg) return leftOrg ? -1 : 1
  const leftDefault = Boolean(left?.is_default)
  const rightDefault = Boolean(right?.is_default)
  if (leftDefault !== rightDefault) return leftDefault ? -1 : 1
  return String(right?.updated_at || '').localeCompare(String(left?.updated_at || ''))
}

function formatRenderModeLabel(renderMode = TEMPLATE_RENDER_MODES.LEGACY_DOCX) {
  return renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Built in app' : 'File based'
}

function summarizeTemplateValidation({
  form = {},
  placeholderRegistry = [],
  packetType = 'otp',
  canonicalFields = [],
} = {}) {
  const blockers = []
  const warnings = []
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const renderMode = normalizeText(form.renderMode || getDefaultRenderMode(normalizedPacketType)) || getDefaultRenderMode(normalizedPacketType)
  const usesNativeRenderer = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED

  if (!normalizeText(form.templateLabel)) {
    blockers.push('Template label is required.')
  }

  if (!normalizeText(form.versionTag)) {
    blockers.push('Version tag is required.')
  }

  if (!usesNativeRenderer && !normalizeText(form.templateStoragePath)) {
    warnings.push('DOCX storage path is not configured yet. Generation will fail until a template file path is saved.')
  }

  const sections = Array.isArray(form.sections) ? form.sections : []
  if (!sections.length) {
    blockers.push('Add at least one template section.')
  }

  const tokenSet = new Set()
  const malformedTokens = []
  const duplicateSectionKeys = new Set()
  const seenSectionKeys = new Set()
  const legacyTokens = []

  for (const section of sections) {
    const sectionKey = normalizeText(section.sectionKey)
    if (!sectionKey) {
      blockers.push('Every section must have a section key.')
    }
    if (sectionKey && seenSectionKeys.has(sectionKey)) {
      duplicateSectionKeys.add(sectionKey)
    }
    seenSectionKeys.add(sectionKey)

    const legalScan = detectTemplateTokenIssues(section.legalText)
    for (const token of legalScan.tokens) tokenSet.add(token)
    for (const issue of legalScan.malformed) {
      malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: ${issue}`)
    }

    for (const token of String(section.placeholderKeysText || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)) {
      if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
        malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: Placeholder "${token}" is malformed.`)
      } else {
        tokenSet.add(token)
      }
    }
  }

  if (duplicateSectionKeys.size) {
    blockers.push(`Duplicate section keys found: ${Array.from(duplicateSectionKeys).join(', ')}`)
  }

  if (malformedTokens.length) {
    blockers.push(...malformedTokens)
  }

  const requiredRegistryKeys = new Set(
    (placeholderRegistry || [])
      .filter((item) => {
        if (item?.is_active === false || !item?.is_required_default) return false
        const registryPacketType = normalizeText(item?.packet_type || item?.packetType).toLowerCase()
        return !registryPacketType || registryPacketType === normalizedPacketType
      })
      .map((item) => normalizeText(item.placeholder_key))
      .filter(Boolean),
  )

  const tokenValidation = validateTemplateTokensAgainstRegistry({
    tokens: Array.from(tokenSet),
    packetType: normalizedPacketType,
  })
  for (const row of tokenValidation.deprecated || []) {
    legacyTokens.push(row)
  }

  const canonicalRequired = new Set(
    (canonicalFields || [])
      .filter((field) => field.required)
      .map((field) => normalizeText(field.key))
      .filter(Boolean),
  )
  const effectiveRequired = new Set([...requiredRegistryKeys, ...canonicalRequired])

  const missingRequired = Array.from(effectiveRequired).filter((key) => {
    const existsDirectly = tokenSet.has(key)
    const existsByAlias = (tokenValidation.normalized || []).includes(key)
    return !existsDirectly && !existsByAlias
  })
  if (missingRequired.length) {
    warnings.push(`Required merge fields are missing from template sections: ${missingRequired.map((key) => `{{${key}}}`).join(', ')}.`)
  }

  const unknownTokens = (tokenValidation.unknown || []).map((row) => row.token)
  if (unknownTokens.length) {
    const withSuggestions = (tokenValidation.unknown || []).map((row) => {
      const suggestion = row.suggested || suggestCanonicalMergeFieldKey(row.token, { packetType })
      return suggestion ? `Unknown field {{${row.token}}}. Suggested replacement: {{${suggestion}}}` : `Unknown field {{${row.token}}}. Add it to the registry or replace it.`
    })
    warnings.push(withSuggestions.join(' '))
  }

  if (legacyTokens.length) {
    warnings.push(
      `Deprecated merge fields detected: ${legacyTokens
        .map((row) => `{{${row.token}}} should become {{${row.canonicalKey}}}`)
        .join('; ')}. These still resolve through aliases for now.`,
    )
  }

  const renderable = blockers.length === 0
  if (usesNativeRenderer && missingRequired.length > 0) {
    warnings.push('Native structured template is missing recommended merge fields, but it can still be activated and generated.')
  }

  return {
    blockers,
    warnings,
    renderable,
    usesNativeRenderer,
    renderMode,
    sectionCount: sections.length,
    tokenCount: tokenSet.size,
    tokenList: Array.from(tokenSet).sort(),
    unknownTokens,
    missingRequired,
    deprecatedTokens: legacyTokens,
    normalizedTokenList: tokenValidation.normalized || [],
    lastValidatedAt: new Date().toISOString(),
  }
}

function buildTemplateMetadata(form = {}, existingMetadata = {}, uploadMeta = null) {
  const renderMode = normalizeText(form.renderMode || TEMPLATE_RENDER_MODES.LEGACY_DOCX) || TEMPLATE_RENDER_MODES.LEGACY_DOCX
  const nextMetadata = {
    ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
    lifecycle_status: normalizeText(form.templateStatus || 'draft') || 'draft',
    render_mode: renderMode,
    template_storage_path: normalizeNullableText(form.templateStoragePath),
    template_storage_bucket: normalizeNullableText(form.templateStorageBucket),
    template_file_name: normalizeNullableText(form.templateFileName),
    template_output_bucket: normalizeNullableText(form.templateOutputBucket),
    native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
    last_render_validation: form.validationSummary && typeof form.validationSummary === 'object'
      ? {
          renderable: Boolean(form.validationSummary.renderable),
          blockingIssues: Array.isArray(form.validationSummary.blockers) ? form.validationSummary.blockers : [],
          warnings: Array.isArray(form.validationSummary.warnings) ? form.validationSummary.warnings : [],
          tokenCount: Number(form.validationSummary.tokenCount || 0),
          sectionCount: Number(form.validationSummary.sectionCount || 0),
          missingRequired: Array.isArray(form.validationSummary.missingRequired) ? form.validationSummary.missingRequired : [],
          deprecatedTokens: Array.isArray(form.validationSummary.deprecatedTokens) ? form.validationSummary.deprecatedTokens : [],
          resolvedPlaceholderKeys: Array.isArray(form.validationSummary.normalizedTokenList)
            ? form.validationSummary.normalizedTokenList
            : [],
          validatedAt: form.validationSummary.lastValidatedAt || new Date().toISOString(),
        }
      : null,
  }

  if (uploadMeta && typeof uploadMeta === 'object') {
    nextMetadata.template_uploaded_at = new Date().toISOString()
    nextMetadata.template_upload_source = 'settings_legal_templates'
  }

  const packetType = normalizeText(form.packetType || form.packet_type).toLowerCase()
  if (packetType === 'mandate') {
    const mandateTemplateVariant = 'default'
    const mandateContentScan = serializeMandateTemplatePublishGateScan(form.mandateContentScan)
    nextMetadata.mandate_template_variant = mandateTemplateVariant
    nextMetadata.mandateTemplateVariant = mandateTemplateVariant
    nextMetadata.mandate_template_variants = [mandateTemplateVariant]
    if (mandateTemplateVariant === 'default') {
      delete nextMetadata.legal_document_scenario
      delete nextMetadata.legalDocumentScenario
      delete nextMetadata.supported_legal_document_scenarios
    } else {
      nextMetadata.legal_document_scenario = mandateTemplateVariant
      nextMetadata.legalDocumentScenario = mandateTemplateVariant
      nextMetadata.supported_legal_document_scenarios = [mandateTemplateVariant]
    }
    if (mandateContentScan) {
      nextMetadata.last_mandate_content_scan = mandateContentScan
      nextMetadata.lastMandateContentScan = mandateContentScan
      nextMetadata.mandate_content_publish_gate_version = mandateContentScan.gateVersion
    } else {
      delete nextMetadata.last_mandate_content_scan
      delete nextMetadata.lastMandateContentScan
      delete nextMetadata.mandate_content_publish_scan
      delete nextMetadata.mandate_content_publish_gate_version
    }
  } else {
    delete nextMetadata.mandate_template_variant
    delete nextMetadata.mandateTemplateVariant
    delete nextMetadata.mandate_template_variants
    delete nextMetadata.supported_mandate_template_variants
    delete nextMetadata.supportedMandateTemplateVariants
    delete nextMetadata.last_mandate_content_scan
    delete nextMetadata.lastMandateContentScan
    delete nextMetadata.mandate_content_publish_gate_version

    const legalTargets = [
      ['seller_clause_profile', 'sellerClauseProfile', normalizeLegalRouteTarget(form.legalSellerClauseProfile, LEGAL_PARTY_ROUTE_OPTIONS)],
      ['buyer_clause_profile', 'buyerClauseProfile', normalizeLegalRouteTarget(form.legalBuyerClauseProfile, LEGAL_PARTY_ROUTE_OPTIONS)],
      ['property_clause_profile', 'propertyClauseProfile', normalizeLegalRouteTarget(form.legalPropertyClauseProfile, LEGAL_PROPERTY_ROUTE_OPTIONS)],
      ['finance_clause_profile', 'financeClauseProfile', normalizeLegalRouteTarget(form.legalFinanceClauseProfile, LEGAL_FINANCE_ROUTE_OPTIONS)],
    ]
    for (const [snakeKey, camelKey, value] of legalTargets) {
      if (value === 'any') {
        delete nextMetadata[snakeKey]
        delete nextMetadata[camelKey]
        delete nextMetadata[`${snakeKey}s`]
        delete nextMetadata[`${camelKey}s`]
      } else {
        nextMetadata[snakeKey] = value
        nextMetadata[camelKey] = value
        nextMetadata[`${snakeKey}s`] = [value]
        nextMetadata[`${camelKey}s`] = [value]
      }
    }
    const legalDocumentScenario = buildOtpLegalScenarioKey(form)
    if (legalDocumentScenario) {
      nextMetadata.legal_document_scenario = legalDocumentScenario
      nextMetadata.legalDocumentScenario = legalDocumentScenario
      nextMetadata.supported_legal_document_scenarios = [legalDocumentScenario]
    } else {
      delete nextMetadata.legal_document_scenario
      delete nextMetadata.legalDocumentScenario
      delete nextMetadata.supported_legal_document_scenarios
      delete nextMetadata.supportedLegalDocumentScenarios
    }
  }

  return nextMetadata
}

function buildSamplePreviewContext(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  if (normalized === 'mandate') {
    return {
      lead: {
        lead_name: 'Sample Seller',
        seller_name: 'Sample Seller',
        seller_email: 'seller@example.com',
        seller_phone: '0820000000',
        sellerOnboarding: {
          status: 'sample',
          formData: {
            sellerFullName: 'Sample Seller',
            entityType: 'company',
            companyRegistrationNumber: '2020/123456/07',
            maritalStatus: 'Married In Community',
            spouseFullName: 'Taylor Seller',
            spouseIdNumber: '7902025009088',
            spouseEmail: 'seller.spouse@example.com',
            spouseConsentRequired: true,
            representativeName: 'Casey Representative',
            representativeCapacity: 'Director',
            trusteeNames: 'Casey Trustee; Sam Trustee',
            resolutionDate: '2026-07-01',
            authorityBasis: 'Board resolution dated 2026-07-01',
          },
        },
      },
      mandateDraft: {
        selling_price: 4500000,
        mandate_type: 'sole',
        sellerEntityType: 'company',
        sellerRegistrationNumber: '2020/123456/07',
        sellerRepresentativeName: 'Casey Representative',
        sellerRepresentativeCapacity: 'Director',
        sellerResolutionDate: '2026-07-01',
        sellerAuthorityBasis: 'Board resolution dated 2026-07-01',
        special_conditions: 'No special conditions captured in sample mode.',
      },
      generatedByName: 'Arch9 Template Tester',
      generatedByRole: 'principal',
    }
  }

  if (normalized.startsWith('commercial_')) {
    return {
      packetType: normalized,
      documentContextType: 'commercial',
      commercialTransactionType: normalized === 'commercial_sale' ? 'sale' : 'lease',
      assetCategory: 'office',
      landlord: {
        name: 'Harcourts Capital Properties',
        registration_number: '2024/123456/07',
        vat_number: '4123456789',
        registered_address: '100 Main Road, Sandton',
        postal_address: 'PO Box 1000, Sandton, 2196',
        phone: '011 000 0000',
        email: 'landlord@example.com',
      },
      assetManager: {
        full_name: 'Jordan Parker',
        position: 'Asset Manager',
        email: 'manager@example.com',
        mobile: '082 555 1234',
        id_number: '8001015009087',
        signing_capacity: 'Authorised Signatory',
        authorityConfirmed: true,
      },
      property: {
        property_name: 'Arch9 Towers',
        address: '100 Main Road, Sandton',
        building_grade: 'A Grade',
        gla_m2: 1250,
        office_area_m2: 750,
        parking_bays: 18,
        asking_rental_per_m2: 165,
        operating_costs: 22,
        asking_sale_price: 12500000,
        rates_and_taxes: 12400,
        lease_term_months: 36,
        escalation_percentage: 8,
        availability_date: '2026-08-01',
        occupation_date: '2026-09-01',
      },
      broker: {
        full_name: 'Alex Broker',
        email: 'broker@example.com',
        mobile: '082 000 0000',
      },
      mandateType: normalized === 'commercial_sale' ? 'Sales Mandate' : 'Leasing Mandate',
      commissionPercentage: '7.5%',
      mandateStartDate: '2026-06-01',
      mandateExpiryDate: '2026-12-31',
      generatedByName: 'Arch9 Template Tester',
      generatedByRole: 'principal',
    }
  }

  return {
    transaction: {
      unit_number: 'Unit 12',
      development_name: 'Sample Estate',
      sale_price: 3250000,
      purchase_price: 3250000,
      stage: 'Offer',
      finance_type: 'bond',
      bond_amount: 2900000,
      cash_amount: 350000,
      buyer_name: 'Sample Buyer',
    },
    unit: {
      unit_number: '12',
      development_name: 'Sample Estate',
      erf_number: 'ERF-1204',
    },
    buyer: {
      full_name: 'Sample Buyer',
      email: 'buyer@example.com',
      phone: '0830000000',
    },
    onboardingFormData: {
      purchaserType: 'company',
      fullName: 'Sample Buyer Pty Ltd',
      companyRegistrationNumber: '2022/123456/07',
      maritalStatus: 'Married In Community',
      spouseFullName: 'Taylor Buyer',
      spouseIdNumber: '9102025009088',
      spouseEmail: 'buyer.spouse@example.com',
      spouseConsentRequired: true,
      authorisedRepresentativeName: 'Jordan Representative',
      authorisedRepresentativeCapacity: 'Director',
      trusteeNames: 'Jordan Trustee; Taylor Trustee',
      trustRegistrationNumber: 'IT1234/2020',
      resolutionDate: '2026-07-01',
      authorityBasis: 'Board resolution dated 2026-07-01',
    },
    sellerDetails: {
      entityType: 'company',
      legalName: 'Sample Seller Pty Ltd',
      registrationNumber: '2020/123456/07',
      maritalStatus: 'Married In Community',
      spouseFullName: 'Taylor Seller',
      spouseIdNumber: '7902025009088',
      spouseEmail: 'seller.spouse@example.com',
      spouseConsentRequired: true,
      trusteeNames: 'Casey Trustee; Sam Trustee',
      resolutionDate: '2026-07-01',
      authorityBasis: 'Board resolution dated 2026-07-01',
      signatory: {
        fullName: 'Casey Representative',
        role: 'Director',
        signingCapacity: 'Director',
        email: 'seller@example.com',
        phone: '0820000000',
      },
    },
    specialConditions: 'Sample preview condition.',
    generatedByName: 'Arch9 Template Tester',
    generatedByRole: 'principal',
  }
}

function getTemplatePreferredDocumentKind(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
  return getDocumentKindOption(
    metadata.document_kind ||
      metadata.documentKind ||
      metadata.preferred_document_kind ||
      metadata.preferredDocumentKind ||
      'standard',
  ).key
}

function getTemplateAddendumType(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
  const starterKey = metadata.addendum_type || metadata.addendumType || metadata.starter_template || metadata.starterTemplate
  return getAddendumDetailConfig(starterKey).key
}

function getPreferredAddendumTemplateForType(templates = [], addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY) {
  const preferredAddendumType = getAddendumDetailConfig(addendumType).key
  const addendumTemplates = (Array.isArray(templates) ? templates : [])
    .filter((template) => getTemplatePreferredDocumentKind(template) === 'addendum')
  return addendumTemplates.find((template) => getTemplateAddendumType(template) === preferredAddendumType)
    || addendumTemplates.find((template) => getTemplateAddendumType(template) === GENERAL_ADDENDUM_TEMPLATE_FAMILY)
    || addendumTemplates[0]
    || null
}

function normalizeAddendumRunDetails(addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY, rawDetails = {}) {
  const config = getAddendumDetailConfig(addendumType)
  const details = rawDetails && typeof rawDetails === 'object' ? rawDetails : {}
  return config.fields.reduce((accumulator, field) => {
    const value = normalizeText(details[field.key])
    if (value) accumulator[field.key] = value
    return accumulator
  }, {})
}

function buildAddendumDocumentReviewSummary(sourceContext = {}) {
  const source = sourceContext && typeof sourceContext === 'object' ? sourceContext : {}
  const documentKind = getDocumentKindOption(source.documentKind || source.document_kind).key
  const hasRelatedDocumentContext = !['standard', 'custom'].includes(documentKind) || normalizeText(source.addendumType || source.addendum_type)
  if (!hasRelatedDocumentContext) {
    return {
      visible: false,
      detailItems: [],
      manifest: null,
    }
  }

  const addendumConfig = getAddendumDetailConfig(source.addendumType || source.addendum_type)
  const addendumDetails = normalizeAddendumRunDetails(addendumConfig.key, source.addendumDetails || source.addendum_details || source)
  const detailItems = addendumConfig.fields
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: normalizeText(addendumDetails[field.key]),
    }))
    .filter((item) => item.value)
  const parentDocumentId = normalizeText(source.parentDocumentId || source.parent_document_id || source.linkedDocumentId || source.linked_document_id)
  const parentDocumentReference = normalizeText(source.parentDocumentReference || source.parent_document_reference)
  const documentChangeSummary = normalizeText(source.documentChangeSummary || source.document_change_summary)
  const label = normalizeText(source.addendumLabel || source.addendum_label) || addendumConfig.label
  const referenceLabel = parentDocumentReference || (parentDocumentId ? `Packet ${parentDocumentId.slice(0, 8)}` : 'Not linked yet')

  return {
    visible: true,
    documentKind,
    addendumType: addendumConfig.key,
    label,
    parentDocumentId,
    parentDocumentReference,
    referenceLabel,
    documentChangeSummary,
    detailItems,
    manifest: {
      documentKind,
      addendumType: addendumConfig.key,
      label,
      parentDocumentId,
      parentDocumentReference,
      documentChangeSummary,
      details: addendumDetails,
    },
  }
}

function buildAddendumRunFormFromPacket({
  packet = {},
  packetType = 'otp',
  templateLabel = '',
  addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY,
} = {}) {
  const sourceContext = getPacketSourceContext(packet)
  const previewContext = sourceContext.contractStudioPreviewContext && typeof sourceContext.contractStudioPreviewContext === 'object'
    ? sourceContext.contractStudioPreviewContext
    : {}
  const previewSourceContext = previewContext.sourceContext && typeof previewContext.sourceContext === 'object'
    ? previewContext.sourceContext
    : {}
  const transactionContext = previewContext.transaction && typeof previewContext.transaction === 'object' ? previewContext.transaction : {}
  const onboardingContext = previewContext.onboardingFormData && typeof previewContext.onboardingFormData === 'object' ? previewContext.onboardingFormData : {}
  const mandateDraftContext = previewContext.mandateDraft && typeof previewContext.mandateDraft === 'object' ? previewContext.mandateDraft : {}
  const resolvedAddendumType = getAddendumDetailConfig(addendumType).key
  const parentDocumentId = normalizeRunReference(packet?.id)
  const parentDocumentReference = normalizeText(
    packet?.title ||
      packet?.template_label_snapshot ||
      packet?.templateLabelSnapshot ||
      sourceContext.documentReference ||
      sourceContext.document_reference,
  ) || (parentDocumentId ? `Packet ${parentDocumentId.slice(0, 8)}` : 'Original document')
  const addendumDetails = normalizeAddendumRunDetails(resolvedAddendumType, {
    ...previewSourceContext,
    ...transactionContext,
    ...onboardingContext,
    ...mandateDraftContext,
    ...(sourceContext.addendumDetails && typeof sourceContext.addendumDetails === 'object' ? sourceContext.addendumDetails : {}),
    ...(sourceContext.addendum_details && typeof sourceContext.addendum_details === 'object' ? sourceContext.addendum_details : {}),
    ...sourceContext,
  })
  const transactionId = normalizeRunReference(packet?.transaction_id || sourceContext.transactionId || sourceContext.transaction_id)
  const leadId = normalizeRunReference(packet?.lead_id || sourceContext.leadId || sourceContext.lead_id)
  const contactId = normalizeRunReference(packet?.contact_id || sourceContext.contactId || sourceContext.contact_id)
  const dealId = normalizeRunReference(packet?.deal_id || sourceContext.dealId || sourceContext.deal_id)
  const unitId = normalizeRunReference(packet?.unit_id || sourceContext.unitId || sourceContext.unit_id)
  const privateListingId = normalizeRunReference(sourceContext.privateListingId || sourceContext.private_listing_id)
  const defaultRunForm = createDefaultDocumentRunForm(packetType, templateLabel, {
    documentKind: 'addendum',
    addendumType: resolvedAddendumType,
  })

  return {
    ...defaultRunForm,
    sourceType: transactionId ? 'transaction' : leadId ? 'lead' : 'manual',
    transactionId,
    leadId,
    contactId,
    dealId,
    unitId,
    privateListingId,
    parentDocumentId,
    parentDocumentReference,
    documentChangeSummary: '',
    addendumType: resolvedAddendumType,
    addendumDetails,
    title: `Addendum - ${parentDocumentReference}`,
  }
}

function buildDocumentPacketRelationshipMap(packets = []) {
  const rows = Array.isArray(packets) ? packets : []
  const relationshipMap = new Map()

  rows.forEach((packet) => {
    const packetId = normalizeText(packet?.id)
    if (!packetId) return
    relationshipMap.set(packetId, {
      packet,
      review: buildAddendumDocumentReviewSummary(getPacketSourceContext(packet)),
      parentPacket: null,
      parentPacketId: '',
      relatedAddendums: [],
    })
  })

  rows.forEach((packet) => {
    const packetId = normalizeText(packet?.id)
    if (!packetId) return
    const relationship = relationshipMap.get(packetId)
    const review = relationship?.review || buildAddendumDocumentReviewSummary(getPacketSourceContext(packet))
    const parentPacketId = normalizeText(review.parentDocumentId)
    if (!review.visible || !parentPacketId) return

    relationship.parentPacketId = parentPacketId
    relationship.parentPacket = relationshipMap.get(parentPacketId)?.packet || null

    const parentRelationship = relationshipMap.get(parentPacketId)
    if (parentRelationship) {
      parentRelationship.relatedAddendums.push({
        packet,
        review,
      })
    }
  })

  return relationshipMap
}

function getAddendumGenerationReadinessForRun(runForm = {}) {
  const documentKind = getDocumentKindOption(runForm.documentKind).key
  if (['standard', 'custom'].includes(documentKind)) {
    return {
      ready: true,
      items: [],
      capturedDetailCount: 0,
    }
  }
  const addendumConfig = getAddendumDetailConfig(runForm.addendumType)
  return getDocumentRunReadiness({
    documentRunForm: {
      ...runForm,
      documentKind,
      addendumType: addendumConfig.key,
    },
    addendumDetailFields: addendumConfig.fields,
  })
}

function compactDocumentRunObject(source = {}) {
  return Object.entries(source || {}).reduce((accumulator, [key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) accumulator[key] = value
      return accumulator
    }
    if (value && typeof value === 'object') {
      if (Object.keys(value).length) accumulator[key] = value
      return accumulator
    }
    const text = normalizeText(value)
    if (text || value === 0 || value === false) accumulator[key] = value
    return accumulator
  }, {})
}

function parseDocumentRunMoney(value = '') {
  const text = normalizeText(value)
  if (!text) return null
  const numeric = Number(text.replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeManualDraftEntityType(value = '', fallback = 'individual') {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['individual', 'company', 'trust', 'close_corporation'].includes(key)) return key
  if (key === 'cc') return 'close_corporation'
  return fallback
}

function normalizeManualDraftFinanceType(value = '') {
  const key = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['bond', 'cash', 'combination'].includes(key)) return key
  if (['hybrid', 'cash_and_bond', 'bond_and_cash'].includes(key)) return 'combination'
  return 'cash'
}

function createDefaultManualDocumentDraft(packetType = 'otp') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (normalizedPacketType === 'mandate') {
    return {
      sellerEntityType: 'individual',
      sellerFullName: '',
      sellerIdNumber: '',
      sellerEmail: '',
      sellerPhone: '',
      sellerDomiciliumAddress: '',
      sellerMaritalStatus: '',
      sellerSpouseFullName: '',
      sellerSpouseIdNumber: '',
      sellerSpouseEmail: '',
      sellerSpouseConsentRequired: '',
      sellerRepresentativeName: '',
      sellerRepresentativeCapacity: '',
      sellerTrusteeNames: '',
      sellerResolutionDate: '',
      sellerAuthorityBasis: '',
      propertyAddress: '',
      propertySuburb: '',
      propertyCity: '',
      propertyType: '',
      unitNumber: '',
      complexName: '',
      erfNumber: '',
      askingPrice: '',
      mandateType: 'sole',
      mandateStartDate: '',
      mandateEndDate: '',
      vatHandling: 'exclusive',
      commissionStructure: 'percentage',
      commissionPercent: '7.5',
      commissionAmount: '',
      specialConditions: '',
    }
  }

  return {
    buyerEntityType: 'individual',
    buyerFullName: '',
    buyerIdNumber: '',
    buyerEmail: '',
    buyerPhone: '',
    buyerDomiciliumAddress: '',
    buyerMaritalStatus: '',
    buyerSpouseFullName: '',
    buyerSpouseIdNumber: '',
    buyerSpouseEmail: '',
    buyerSpouseConsentRequired: '',
    buyerCompanyRegistrationNumber: '',
    buyerRepresentativeName: '',
    buyerRepresentativeCapacity: '',
    buyerTrustRegistrationNumber: '',
    buyerTrusteeNames: '',
    buyerResolutionDate: '',
    buyerAuthorityBasis: '',
    coBuyerFullName: '',
    coBuyerEmail: '',
    coBuyerPhone: '',
    coBuyerIdNumber: '',
    sellerEntityType: 'company',
    sellerFullName: '',
    sellerIdNumber: '',
    sellerEmail: '',
    sellerPhone: '',
    sellerRegisteredAddress: '',
    sellerMaritalStatus: '',
    sellerSpouseFullName: '',
    sellerSpouseIdNumber: '',
    sellerSpouseEmail: '',
    sellerSpouseConsentRequired: '',
    sellerRepresentativeName: '',
    sellerRepresentativeCapacity: '',
    sellerRepresentativeEmail: '',
    sellerRepresentativePhone: '',
    sellerRepresentativeIdNumber: '',
    sellerTrusteeNames: '',
    sellerResolutionDate: '',
    sellerAuthorityBasis: '',
    propertyAddress: '',
    propertySuburb: '',
    propertyCity: '',
    propertyType: '',
    unitNumber: '',
    complexName: '',
    erfNumber: '',
    purchasePrice: '',
    depositAmount: '',
    financeType: 'cash',
    bondAmount: '',
    cashAmount: '',
    occupationDate: '',
    transferDate: '',
    suspensiveConditions: '',
    specialConditions: '',
  }
}

function buildMandateManualDocumentContext(manualDraft = {}) {
  const draft = {
    ...createDefaultManualDocumentDraft('mandate'),
    ...(manualDraft && typeof manualDraft === 'object' ? manualDraft : {}),
  }
  const sellerEntityType = normalizeManualDraftEntityType(draft.sellerEntityType)
  const seller = compactDocumentRunObject({
    entityType: sellerEntityType,
    fullName: draft.sellerFullName,
    name: draft.sellerFullName,
    idNumber: draft.sellerIdNumber,
    registrationNumber: draft.sellerIdNumber,
    email: draft.sellerEmail,
    phone: draft.sellerPhone,
    domiciliumAddress: draft.sellerDomiciliumAddress,
    maritalStatus: draft.sellerMaritalStatus,
    spouseFullName: draft.sellerSpouseFullName,
    spouseName: draft.sellerSpouseFullName,
    spouseIdNumber: draft.sellerSpouseIdNumber,
    spouseEmail: draft.sellerSpouseEmail,
    spouseConsentRequired: draft.sellerSpouseConsentRequired,
    representativeName: draft.sellerRepresentativeName,
    representativeCapacity: draft.sellerRepresentativeCapacity,
    trusteeNames: draft.sellerTrusteeNames,
    resolutionDate: draft.sellerResolutionDate,
    authorityBasis: draft.sellerAuthorityBasis,
  })
  const property = compactDocumentRunObject({
    address: draft.propertyAddress,
    propertyAddress: draft.propertyAddress,
    fullAddress: draft.propertyAddress,
    suburb: draft.propertySuburb,
    city: draft.propertyCity,
    propertyType: draft.propertyType,
    type: draft.propertyType,
    unitNumber: draft.unitNumber,
    complexName: draft.complexName,
    estateComplexName: draft.complexName,
    erfNumber: draft.erfNumber,
  })
  const askingPrice = parseDocumentRunMoney(draft.askingPrice)
  const commissionAmount = parseDocumentRunMoney(draft.commissionAmount)
  const mandate = compactDocumentRunObject({
    type: draft.mandateType,
    startDate: draft.mandateStartDate,
    endDate: draft.mandateEndDate,
    expiryDate: draft.mandateEndDate,
    vatHandling: draft.vatHandling,
    commissionStructure: draft.commissionStructure,
    commissionPercent: draft.commissionPercent,
    commissionPercentage: draft.commissionPercent,
    commissionAmount: commissionAmount ?? draft.commissionAmount,
    askingPrice: askingPrice ?? draft.askingPrice,
    specialConditions: draft.specialConditions,
  })
  const onboardingFormData = compactDocumentRunObject({
    seller_full_name: draft.sellerFullName,
    fullName: draft.sellerFullName,
    displayName: draft.sellerFullName,
    seller_id_number: draft.sellerIdNumber,
    idNumber: draft.sellerIdNumber,
    email: draft.sellerEmail,
    sellerEmail: draft.sellerEmail,
    phone: draft.sellerPhone,
    sellerPhone: draft.sellerPhone,
    entityType: sellerEntityType,
    sellerType: sellerEntityType,
    companyRegistrationNumber: sellerEntityType === 'trust' ? '' : draft.sellerIdNumber,
    trustRegistrationNumber: sellerEntityType === 'trust' ? draft.sellerIdNumber : '',
    domiciliumAddress: draft.sellerDomiciliumAddress,
    maritalStatus: draft.sellerMaritalStatus,
    spouseFullName: draft.sellerSpouseFullName,
    spouseName: draft.sellerSpouseFullName,
    spouseIdNumber: draft.sellerSpouseIdNumber,
    spouseEmail: draft.sellerSpouseEmail,
    spouseConsentRequired: draft.sellerSpouseConsentRequired,
    representativeName: draft.sellerRepresentativeName,
    representativeCapacity: draft.sellerRepresentativeCapacity,
    trusteeNames: draft.sellerTrusteeNames,
    resolutionDate: draft.sellerResolutionDate,
    authorityBasis: draft.sellerAuthorityBasis,
    propertyAddress: draft.propertyAddress,
    property_address: draft.propertyAddress,
    suburb: draft.propertySuburb,
    city: draft.propertyCity,
    propertyType: draft.propertyType,
    unitNumber: draft.unitNumber,
    complexName: draft.complexName,
    erfNumber: draft.erfNumber,
    askingPrice: draft.askingPrice,
    mandateType: draft.mandateType,
    mandateStartDate: draft.mandateStartDate,
    mandateEndDate: draft.mandateEndDate,
    commissionStructure: draft.commissionStructure,
    commissionPercent: draft.commissionPercent,
    commissionAmount: draft.commissionAmount,
    vatHandling: draft.vatHandling,
    specialConditions: draft.specialConditions,
  })
  const sourceContext = {
    mandateDraft: draft,
    seller,
    property,
    mandate,
    property_address: draft.propertyAddress,
    seller_full_name: draft.sellerFullName,
    mandate_type: draft.mandateType,
    commission_structure: draft.commissionStructure,
  }

  return {
    mandateDraft: draft,
    mandateData: {
      seller,
      property,
      mandate,
      mandateDraft: draft,
      sourceContext,
    },
    lead: compactDocumentRunObject({
      name: draft.sellerFullName,
      sellerName: draft.sellerFullName,
      sellerEmail: draft.sellerEmail,
      sellerPhone: draft.sellerPhone,
      sellerPropertyAddress: draft.propertyAddress,
      propertyAddress: draft.propertyAddress,
      propertyInterest: draft.propertyAddress,
      estimatedValue: askingPrice ?? draft.askingPrice,
      mandateType: draft.mandateType,
      commissionStructure: draft.commissionStructure,
      commissionPercent: draft.commissionPercent,
      commissionAmount: draft.commissionAmount,
      vatHandling: draft.vatHandling,
      sellerOnboarding: {
        status: 'manual_details',
        formData: onboardingFormData,
      },
    }),
    onboardingFormData,
    sourceContext,
    specialConditions: draft.specialConditions,
  }
}

function buildOtpManualDocumentContext(manualDraft = {}) {
  const draft = {
    ...createDefaultManualDocumentDraft('otp'),
    ...(manualDraft && typeof manualDraft === 'object' ? manualDraft : {}),
  }
  const buyerEntityType = normalizeManualDraftEntityType(draft.buyerEntityType)
  const sellerEntityType = normalizeManualDraftEntityType(draft.sellerEntityType, 'company')
  const financeType = normalizeManualDraftFinanceType(draft.financeType)
  const purchasePrice = parseDocumentRunMoney(draft.purchasePrice)
  const depositAmount = parseDocumentRunMoney(draft.depositAmount)
  const bondAmount = parseDocumentRunMoney(draft.bondAmount)
  const cashAmount = parseDocumentRunMoney(draft.cashAmount)
  const buyer = compactDocumentRunObject({
    name: draft.buyerFullName,
    fullName: draft.buyerFullName,
    email: draft.buyerEmail,
    phone: draft.buyerPhone,
    idNumber: draft.buyerIdNumber,
    registrationNumber: draft.buyerCompanyRegistrationNumber || draft.buyerTrustRegistrationNumber || draft.buyerIdNumber,
    companyRegistrationNumber: draft.buyerCompanyRegistrationNumber,
    trustRegistrationNumber: draft.buyerTrustRegistrationNumber,
    entityType: buyerEntityType,
    maritalStatus: draft.buyerMaritalStatus,
    spouseFullName: draft.buyerSpouseFullName,
    spouseName: draft.buyerSpouseFullName,
    spouseIdNumber: draft.buyerSpouseIdNumber,
    spouseEmail: draft.buyerSpouseEmail,
    spouseConsentRequired: draft.buyerSpouseConsentRequired,
    representativeName: draft.buyerRepresentativeName,
    representativeCapacity: draft.buyerRepresentativeCapacity,
    trusteeNames: draft.buyerTrusteeNames,
    resolutionDate: draft.buyerResolutionDate,
    authorityBasis: draft.buyerAuthorityBasis,
    domiciliumAddress: draft.buyerDomiciliumAddress,
  })
  const seller = compactDocumentRunObject({
    entityType: sellerEntityType,
    fullName: draft.sellerFullName,
    name: draft.sellerFullName,
    idNumber: draft.sellerIdNumber,
    registrationNumber: draft.sellerIdNumber,
    email: draft.sellerEmail,
    phone: draft.sellerPhone,
    registeredAddress: draft.sellerRegisteredAddress,
    maritalStatus: draft.sellerMaritalStatus,
    spouseFullName: draft.sellerSpouseFullName,
    spouseName: draft.sellerSpouseFullName,
    spouseIdNumber: draft.sellerSpouseIdNumber,
    spouseEmail: draft.sellerSpouseEmail,
    spouseConsentRequired: draft.sellerSpouseConsentRequired,
    representativeName: draft.sellerRepresentativeName,
    representativeCapacity: draft.sellerRepresentativeCapacity,
    representativeEmail: draft.sellerRepresentativeEmail || draft.sellerEmail,
    representativePhone: draft.sellerRepresentativePhone || draft.sellerPhone,
    representativeIdNumber: draft.sellerRepresentativeIdNumber,
    trusteeNames: draft.sellerTrusteeNames,
    resolutionDate: draft.sellerResolutionDate,
    authorityBasis: draft.sellerAuthorityBasis,
  })
  const property = compactDocumentRunObject({
    address: draft.propertyAddress,
    propertyAddress: draft.propertyAddress,
    suburb: draft.propertySuburb,
    city: draft.propertyCity,
    propertyType: draft.propertyType,
    unitNumber: draft.unitNumber,
    complexName: draft.complexName,
    estateComplexName: draft.complexName,
    erfNumber: draft.erfNumber,
  })
  const transaction = compactDocumentRunObject({
    purchaser_type: buyerEntityType,
    seller_type: sellerEntityType,
    seller_registration_number: draft.sellerIdNumber,
    property_address_line_1: draft.propertyAddress,
    property_address: draft.propertyAddress,
    suburb: draft.propertySuburb,
    city: draft.propertyCity,
    property_type: draft.propertyType,
    finance_type: financeType,
    purchase_price: purchasePrice ?? draft.purchasePrice,
    sales_price: purchasePrice ?? draft.purchasePrice,
    deposit_amount: depositAmount ?? draft.depositAmount,
    bond_amount: bondAmount ?? draft.bondAmount,
    cash_amount: cashAmount ?? draft.cashAmount,
  })
  const onboardingFormData = compactDocumentRunObject({
    purchaserType: buyerEntityType,
    purchaser_type: buyerEntityType,
    fullName: draft.buyerFullName,
    full_name: draft.buyerFullName,
    idNumber: draft.buyerIdNumber,
    identityNumber: draft.buyerIdNumber,
    email: draft.buyerEmail,
    buyerEmail: draft.buyerEmail,
    phone: draft.buyerPhone,
    buyerPhone: draft.buyerPhone,
    maritalStatus: draft.buyerMaritalStatus,
    spouseFullName: draft.buyerSpouseFullName,
    spouseName: draft.buyerSpouseFullName,
    spouseIdNumber: draft.buyerSpouseIdNumber,
    spouseEmail: draft.buyerSpouseEmail,
    spouseConsentRequired: draft.buyerSpouseConsentRequired,
    companyRegistrationNumber: draft.buyerCompanyRegistrationNumber,
    trustRegistrationNumber: draft.buyerTrustRegistrationNumber,
    residentialAddress: draft.buyerDomiciliumAddress,
    physicalAddress: draft.buyerDomiciliumAddress,
    authorizedRepresentativeName: draft.buyerRepresentativeName,
    authorisedRepresentativeName: draft.buyerRepresentativeName,
    authorizedRepresentativeCapacity: draft.buyerRepresentativeCapacity,
    authorisedRepresentativeCapacity: draft.buyerRepresentativeCapacity,
    trusteeNames: draft.buyerTrusteeNames,
    resolutionDate: draft.buyerResolutionDate,
    authorityBasis: draft.buyerAuthorityBasis,
    co_buyer_name: draft.coBuyerFullName,
    coBuyerName: draft.coBuyerFullName,
    co_buyer_email: draft.coBuyerEmail,
    coBuyerEmail: draft.coBuyerEmail,
    co_buyer_phone: draft.coBuyerPhone,
    coBuyerPhone: draft.coBuyerPhone,
    co_buyer_id_number: draft.coBuyerIdNumber,
    coBuyerIdNumber: draft.coBuyerIdNumber,
    propertyAddress: draft.propertyAddress,
    property_address: draft.propertyAddress,
    suburb: draft.propertySuburb,
    propertySuburb: draft.propertySuburb,
    city: draft.propertyCity,
    propertyCity: draft.propertyCity,
    propertyType: draft.propertyType,
    unitNumber: draft.unitNumber,
    unit_number: draft.unitNumber,
    complexName: draft.complexName,
    estateComplexName: draft.complexName,
    erfNumber: draft.erfNumber,
    depositAmount: draft.depositAmount,
    deposit_amount: draft.depositAmount,
    financeType,
    finance_type: financeType,
    bondAmount: draft.bondAmount,
    bond_amount: draft.bondAmount,
    cashAmount: draft.cashAmount,
    cash_amount: draft.cashAmount,
    occupationDate: draft.occupationDate,
    occupation_date: draft.occupationDate,
    transferDate: draft.transferDate,
    transfer_date: draft.transferDate,
    suspensiveConditions: draft.suspensiveConditions,
    suspensive_conditions: draft.suspensiveConditions,
    specialConditions: draft.specialConditions,
    special_conditions: draft.specialConditions,
  })
  const sourceContext = {
    otpDraft: draft,
    buyer,
    seller,
    property,
    offer: {
      ...compactDocumentRunObject({
        purchasePrice: draft.purchasePrice,
        depositAmount: draft.depositAmount,
        financeType,
        bondAmount: draft.bondAmount,
        cashAmount: draft.cashAmount,
        occupationDate: draft.occupationDate,
        transferDate: draft.transferDate,
      }),
      conditions: compactDocumentRunObject({
        suspensiveConditions: draft.suspensiveConditions,
        specialConditions: draft.specialConditions,
      }),
    },
    signatureParties: compactDocumentRunObject({
      buyerName: draft.buyerRepresentativeName || draft.buyerFullName,
      sellerName: draft.sellerRepresentativeName || draft.sellerFullName,
    }),
  }

  return {
    otpDraft: draft,
    transaction,
    buyer,
    sellerDetails: {
      ...seller,
      legalName: draft.sellerFullName,
      tradingName: draft.sellerFullName,
      registrationNumber: draft.sellerIdNumber,
      companyRegistrationNumber: sellerEntityType === 'trust' ? '' : draft.sellerIdNumber,
      trustRegistrationNumber: sellerEntityType === 'trust' ? draft.sellerIdNumber : '',
      signatory: compactDocumentRunObject({
        fullName: draft.sellerRepresentativeName,
        role: draft.sellerRepresentativeCapacity,
        signingCapacity: draft.sellerRepresentativeCapacity,
        idNumber: draft.sellerRepresentativeIdNumber,
        email: draft.sellerRepresentativeEmail || draft.sellerEmail,
        phone: draft.sellerRepresentativePhone || draft.sellerPhone,
      }),
    },
    onboardingFormData,
    sourceContext,
    specialConditions: draft.specialConditions,
    generatedDataSnapshot: {
      otpDraft: draft,
      transaction,
      buyer,
      sellerDetails: {
        ...seller,
        legalName: draft.sellerFullName,
        tradingName: draft.sellerFullName,
        registrationNumber: draft.sellerIdNumber,
      },
      onboardingFormData,
      sourceContext,
    },
  }
}

function buildManualDocumentRunContext({ packetType = 'otp', manualDraft = {}, enabled = false } = {}) {
  if (!enabled) return {}
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (normalizedPacketType === 'mandate') return buildMandateManualDocumentContext(manualDraft)
  if (normalizedPacketType === 'otp') return buildOtpManualDocumentContext(manualDraft)
  return {}
}

function firstDocumentRunText(...values) {
  return values.map((value) => normalizeText(value)).find(Boolean) || ''
}

function getDocumentPickerContactName(contact = {}) {
  return firstDocumentRunText(
    contact.name,
    contact.fullName,
    [contact.firstName, contact.lastName].map(normalizeText).filter(Boolean).join(' '),
    contact.email,
    contact.phone,
  )
}

function isDocumentPickerRecord(record) {
  return Boolean(record && typeof record === 'object')
}

function buildDocumentClientLinkOptions(snapshot = {}) {
  const contacts = Array.isArray(snapshot.contacts) ? snapshot.contacts.filter(isDocumentPickerRecord) : []
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads.filter(isDocumentPickerRecord) : []
  const contactById = new Map(contacts.map((contact) => [normalizeText(contact.contactId || contact.contact_id || contact.id), contact]).filter(([id]) => id))
  const leadOptions = leads.slice(0, 50).map((lead) => {
    const contact = contactById.get(normalizeText(lead.contactId || lead.contact_id)) || {}
    const contactName = getDocumentPickerContactName(contact)
    const leadCategory = normalizeText(lead.leadCategory || lead.lead_category || lead.category || '').toLowerCase()
    const label = firstDocumentRunText(
      contactName,
      lead.name,
      lead.sellerName,
      lead.enquiredPropertyTitle,
      lead.propertyInterest,
      'Saved lead',
    )
    const propertyAddress = firstDocumentRunText(
      lead.enquiredPropertyAddress,
      lead.sellerPropertyAddress,
      lead.formattedAddress,
      lead.streetAddress,
      lead.propertyInterest,
    )
    const price = lead.enquiredPropertyPrice ?? lead.estimatedValue ?? lead.budget ?? ''
    return {
      key: `lead:${normalizeText(lead.leadId || lead.lead_id || lead.id)}`,
      kind: 'lead',
      label,
      helper: [
        leadCategory ? `${leadCategory} lead` : 'lead',
        contact.email,
        propertyAddress,
      ].map(normalizeText).filter(Boolean).join(' · '),
      leadId: normalizeText(lead.leadId || lead.lead_id || lead.id),
      contactId: normalizeText(contact.contactId || contact.contact_id || contact.id || lead.contactId || lead.contact_id),
      mandateDraftPatch: compactDocumentRunObject({
        sellerFullName: contactName || lead.sellerName,
        sellerEmail: contact.email || lead.sellerEmail || lead.email,
        sellerPhone: contact.phone || lead.sellerPhone || lead.phone,
        propertyAddress,
        propertySuburb: lead.suburb,
        propertyCity: lead.city,
        askingPrice: price ? String(price) : '',
      }),
      otpDraftPatch: compactDocumentRunObject({
        buyerFullName: contactName,
        buyerEmail: contact.email || lead.email,
        buyerPhone: contact.phone || lead.phone,
        propertyAddress,
        propertySuburb: lead.suburb,
        propertyCity: lead.city,
        purchasePrice: price ? String(price) : '',
      }),
    }
  }).filter((option) => option.leadId || option.contactId)

  const leadContactIds = new Set(leadOptions.map((option) => normalizeText(option.contactId)).filter(Boolean))
  const contactOptions = contacts
    .filter((contact) => !leadContactIds.has(normalizeText(contact.contactId || contact.contact_id || contact.id)))
    .slice(0, 30)
    .map((contact) => {
      const contactName = getDocumentPickerContactName(contact)
      return {
        key: `contact:${normalizeText(contact.contactId || contact.contact_id || contact.id)}`,
        kind: 'contact',
        label: contactName || 'Saved contact',
        helper: [contact.contactType || contact.contact_type || 'contact', contact.email, contact.phone].map(normalizeText).filter(Boolean).join(' · '),
        leadId: '',
        contactId: normalizeText(contact.contactId || contact.contact_id || contact.id),
        mandateDraftPatch: compactDocumentRunObject({
          sellerFullName: contactName,
          sellerEmail: contact.email,
          sellerPhone: contact.phone,
        }),
        otpDraftPatch: compactDocumentRunObject({
          buyerFullName: contactName,
          buyerEmail: contact.email,
          buyerPhone: contact.phone,
        }),
      }
    })

  return [...leadOptions, ...contactOptions]
}

function buildDocumentPropertyLinkOptions(listings = []) {
  return (Array.isArray(listings) ? listings.filter(isDocumentPickerRecord) : []).slice(0, 50).map((listing) => {
    const listingId = normalizeText(listing.id || listing.privateListingId || listing.private_listing_id)
    const propertyAddress = firstDocumentRunText(
      listing.propertyAddress,
      listing.addressLine1,
      listing.address_line_1,
      listing.title,
    )
    const price = listing.askingPrice || listing.asking_price || listing.estimatedValue || ''
    return {
      key: `listing:${listingId}`,
      kind: 'listing',
      label: firstDocumentRunText(listing.title, propertyAddress, listing.listingReference, 'Saved property'),
      helper: [
        propertyAddress,
        listing.suburb,
        listing.listingStatus || listing.status,
      ].map(normalizeText).filter(Boolean).join(' · '),
      privateListingId: listingId,
      leadId: normalizeText(listing.sellerLeadId || listing.seller_lead_id),
      mandatePacketId: normalizeText(listing.mandatePacketId || listing.mandate_packet_id),
      mandateDraftPatch: compactDocumentRunObject({
        propertyAddress,
        propertySuburb: listing.suburb,
        propertyCity: listing.city,
        propertyType: listing.propertyType || listing.property_type,
        unitNumber: listing.unitNumber || listing.unit_number,
        complexName: listing.complexName || listing.complex_name,
        erfNumber: listing.erfNumber || listing.erf_number,
        askingPrice: price ? String(price) : '',
        mandateType: listing.mandateType || listing.mandate_type,
      }),
      otpDraftPatch: compactDocumentRunObject({
        propertyAddress,
        propertySuburb: listing.suburb,
        propertyCity: listing.city,
        propertyType: listing.propertyType || listing.property_type,
        unitNumber: listing.unitNumber || listing.unit_number,
        complexName: listing.complexName || listing.complex_name,
        erfNumber: listing.erfNumber || listing.erf_number,
        purchasePrice: price ? String(price) : '',
      }),
    }
  }).filter((option) => option.privateListingId)
}

function createDefaultDocumentRunForm(packetType = 'otp', templateLabel = '', options = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const sourceType = normalizedPacketType === 'mandate' ? 'lead' : 'transaction'
  const documentKindOption = getDocumentKindOption(options.documentKind || options.document_kind || 'standard')
  const addendumConfig = getAddendumDetailConfig(options.addendumType || options.addendum_type || options.starter_template || options.starterTemplate)
  const title = templateLabel
    ? documentKindOption.key === 'standard'
      ? `${templateLabel} document run`
      : `${documentKindOption.label} - ${templateLabel}`
    : documentKindOption.key === 'standard'
      ? 'New document run'
      : `New ${documentKindOption.label.toLowerCase()}`
  return {
    documentKind: documentKindOption.key,
    sourceType,
    documentStart: DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument,
    documentStartSourceMode: '',
    transactionId: '',
    leadId: '',
    contactId: '',
    dealId: '',
    unitId: '',
    privateListingId: '',
    linkedClientKey: '',
    linkedPropertyKey: '',
    parentDocumentId: '',
    parentDocumentReference: '',
    documentChangeSummary: '',
    addendumType: addendumConfig.key,
    addendumDetails: {},
    manualDraftType: normalizedPacketType,
    manualDraft: createDefaultManualDocumentDraft(normalizedPacketType),
    title,
    useSampleFallback: false,
    contextJson: '',
  }
}

function parseDocumentRunContextJson(rawValue = '') {
  const value = String(rawValue || '').trim()
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Context JSON must be an object.')
    }
    return parsed
  } catch (error) {
    throw new Error(error?.message || 'Context JSON is not valid.')
  }
}

function isUuidText(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeRunReference(value = '') {
  const text = normalizeText(value)
  return isUuidText(text) ? text : ''
}

function buildDocumentRunPayload({
  runForm = {},
  packetType = 'otp',
  selectedTemplate = null,
  templateDetail = null,
  form = {},
  moduleType = 'agency',
  validationSummary = null,
  templateTypeConfig = {},
} = {}) {
  const sourceType = normalizeText(runForm.sourceType || 'transaction').toLowerCase()
  const documentKind = getDocumentKindOption(runForm.documentKind).key
  const documentKindLabel = getDocumentKindOption(documentKind).label
  const documentStart = normalizeText(runForm.documentStart || DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument)
  const transactionId = normalizeRunReference(runForm.transactionId)
  const leadId = normalizeRunReference(runForm.leadId)
  const contactId = normalizeRunReference(runForm.contactId)
  const dealId = normalizeRunReference(runForm.dealId)
  const unitId = normalizeRunReference(runForm.unitId)
  const privateListingId = normalizeRunReference(runForm.privateListingId)
  const linkedClientKey = normalizeText(runForm.linkedClientKey)
  const linkedPropertyKey = normalizeText(runForm.linkedPropertyKey)
  const parentDocumentId = normalizeRunReference(runForm.parentDocumentId)
  const parentDocumentReference = normalizeText(runForm.parentDocumentReference)
  const documentChangeSummary = normalizeText(runForm.documentChangeSummary)
  const contextOverrides = parseDocumentRunContextJson(runForm.contextJson)
  const sampleFallback = runForm.useSampleFallback ? buildSamplePreviewContext(packetType) : {}
  const sourceContextOverrides = contextOverrides.sourceContext && typeof contextOverrides.sourceContext === 'object'
    ? contextOverrides.sourceContext
    : {}
  const inferredStartSourceMode = sourceType === 'manual'
    ? DOCUMENT_START_SOURCE_MODES.manual
    : DOCUMENT_START_SOURCE_MODES.saved
  const requestedStartSourceMode = normalizeText(
    runForm.documentStartSourceMode ||
      sourceContextOverrides.sourceMode ||
      sourceContextOverrides.source_mode ||
      inferredStartSourceMode,
  )
  const documentStartSourceMode = sourceType === 'manual'
    ? DOCUMENT_START_SOURCE_MODES.manual
    : requestedStartSourceMode || inferredStartSourceMode
  const manualDraft = runForm.manualDraft && typeof runForm.manualDraft === 'object'
    ? runForm.manualDraft
    : {}
  const usesManualDraftContext = documentKind === 'standard' &&
    ['otp', 'mandate'].includes(normalizeText(packetType).toLowerCase()) &&
    (sourceType === 'manual' || documentStartSourceMode === DOCUMENT_START_SOURCE_MODES.manual)
  const manualDocumentContext = buildManualDocumentRunContext({
    packetType,
    manualDraft,
    enabled: usesManualDraftContext,
  })
  const addendumConfig = getAddendumDetailConfig(runForm.addendumType || sourceContextOverrides.addendumType || sourceContextOverrides.addendum_type)
  const sourceAddendumDetails = sourceContextOverrides.addendumDetails && typeof sourceContextOverrides.addendumDetails === 'object'
    ? sourceContextOverrides.addendumDetails
    : sourceContextOverrides.addendum_details && typeof sourceContextOverrides.addendum_details === 'object'
      ? sourceContextOverrides.addendum_details
      : sourceContextOverrides
  const addendumDetails = {
    ...normalizeAddendumRunDetails(addendumConfig.key, sourceAddendumDetails),
    ...normalizeAddendumRunDetails(addendumConfig.key, runForm.addendumDetails),
  }
  const addendumSpecialConditions = normalizeText(addendumDetails.special_conditions || addendumDetails.suspensive_conditions || documentChangeSummary)
  const mandateDraftOverrides = contextOverrides.mandateDraft && typeof contextOverrides.mandateDraft === 'object'
    ? contextOverrides.mandateDraft
    : {}
  const mandateDataOverrides = contextOverrides.mandateData && typeof contextOverrides.mandateData === 'object'
    ? contextOverrides.mandateData
    : {}
  const sourceConditionsOverrides = sourceContextOverrides.conditions && typeof sourceContextOverrides.conditions === 'object'
    ? sourceContextOverrides.conditions
    : {}
  const sourceContext = {
    ...sourceContextOverrides,
    ...(manualDocumentContext.sourceContext || {}),
    ...addendumDetails,
    sourceType,
    documentStart,
    document_start: documentStart,
    sourceMode: documentStartSourceMode,
    source_mode: documentStartSourceMode,
    standaloneDocumentStart: sourceType === 'manual' && !transactionId && !leadId && !dealId && !unitId && !privateListingId,
    standalone_document_start: sourceType === 'manual' && !transactionId && !leadId && !dealId && !unitId && !privateListingId,
    linkedClientKey,
    linked_client_key: linkedClientKey,
    linkedPropertyKey,
    linked_property_key: linkedPropertyKey,
    transactionId: transactionId || sourceContextOverrides.transactionId || sourceContextOverrides.transaction_id || '',
    transaction_id: transactionId || sourceContextOverrides.transaction_id || sourceContextOverrides.transactionId || '',
    leadId: leadId || sourceContextOverrides.leadId || sourceContextOverrides.lead_id || '',
    lead_id: leadId || sourceContextOverrides.lead_id || sourceContextOverrides.leadId || '',
    contactId: contactId || sourceContextOverrides.contactId || sourceContextOverrides.contact_id || '',
    contact_id: contactId || sourceContextOverrides.contact_id || sourceContextOverrides.contactId || '',
    dealId: dealId || sourceContextOverrides.dealId || sourceContextOverrides.deal_id || '',
    deal_id: dealId || sourceContextOverrides.deal_id || sourceContextOverrides.dealId || '',
    unitId: unitId || sourceContextOverrides.unitId || sourceContextOverrides.unit_id || '',
    unit_id: unitId || sourceContextOverrides.unit_id || sourceContextOverrides.unitId || '',
    privateListingId: privateListingId || sourceContextOverrides.privateListingId || sourceContextOverrides.private_listing_id || '',
    private_listing_id: privateListingId || sourceContextOverrides.private_listing_id || sourceContextOverrides.privateListingId || '',
    parentDocumentId: parentDocumentId || sourceContextOverrides.parentDocumentId || sourceContextOverrides.parent_document_id || '',
    parent_document_id: parentDocumentId || sourceContextOverrides.parent_document_id || sourceContextOverrides.parentDocumentId || '',
    linkedDocumentId: parentDocumentId || sourceContextOverrides.linkedDocumentId || sourceContextOverrides.linked_document_id || '',
    linked_document_id: parentDocumentId || sourceContextOverrides.linked_document_id || sourceContextOverrides.linkedDocumentId || '',
    parentDocumentReference: parentDocumentReference || sourceContextOverrides.parentDocumentReference || sourceContextOverrides.parent_document_reference || '',
    parent_document_reference: parentDocumentReference || sourceContextOverrides.parent_document_reference || sourceContextOverrides.parentDocumentReference || '',
    documentChangeSummary: documentChangeSummary || sourceContextOverrides.documentChangeSummary || sourceContextOverrides.document_change_summary || '',
    document_change_summary: documentChangeSummary || sourceContextOverrides.document_change_summary || sourceContextOverrides.documentChangeSummary || '',
    addendumType: addendumConfig.key,
    addendum_type: addendumConfig.key,
    addendumLabel: addendumConfig.label,
    addendum_label: addendumConfig.label,
    addendumDetails,
    addendum_details: addendumDetails,
    conditions: {
      ...sourceConditionsOverrides,
      ...(addendumDetails.occupation_date ? { occupation_date: addendumDetails.occupation_date, occupationDate: addendumDetails.occupation_date } : {}),
      ...(addendumDetails.transfer_date ? { transfer_date: addendumDetails.transfer_date, transferDate: addendumDetails.transfer_date } : {}),
      ...(addendumDetails.suspensive_conditions ? { suspensive_conditions: addendumDetails.suspensive_conditions, suspensiveConditions: addendumDetails.suspensive_conditions } : {}),
    },
    documentRelationship: documentKind === 'standard' ? 'primary' : documentKind,
    document_relationship: documentKind === 'standard' ? 'primary' : documentKind,
    documentKind,
    document_kind: documentKind,
    documentKindLabel,
    document_kind_label: documentKindLabel,
    contractStudioRun: {
      generatedFrom: 'contract_studio_phase_6',
      sourceType,
      sourceMode: documentStartSourceMode,
      documentStart,
      documentKind,
      parentDocumentId,
      parentDocumentReference,
      linkedClientKey,
      linkedPropertyKey,
      privateListingId,
      addendumType: addendumConfig.key,
      addendumDetails,
      testedAt: new Date().toISOString(),
      templateId: selectedTemplate?.id || templateDetail?.id || '',
    },
  }
  const context = {
    ...sampleFallback,
    ...contextOverrides,
    transaction: {
      ...(sampleFallback.transaction && typeof sampleFallback.transaction === 'object' ? sampleFallback.transaction : {}),
      ...(contextOverrides.transaction && typeof contextOverrides.transaction === 'object' ? contextOverrides.transaction : {}),
      ...(manualDocumentContext.transaction && typeof manualDocumentContext.transaction === 'object' ? manualDocumentContext.transaction : {}),
      ...addendumDetails,
      ...(transactionId ? { id: transactionId, transaction_id: transactionId } : {}),
    },
    lead: {
      ...(sampleFallback.lead && typeof sampleFallback.lead === 'object' ? sampleFallback.lead : {}),
      ...(contextOverrides.lead && typeof contextOverrides.lead === 'object' ? contextOverrides.lead : {}),
      ...(manualDocumentContext.lead && typeof manualDocumentContext.lead === 'object' ? manualDocumentContext.lead : {}),
      ...(leadId ? { id: leadId, lead_id: leadId } : {}),
    },
    buyer: {
      ...(sampleFallback.buyer && typeof sampleFallback.buyer === 'object' ? sampleFallback.buyer : {}),
      ...(contextOverrides.buyer && typeof contextOverrides.buyer === 'object' ? contextOverrides.buyer : {}),
      ...(manualDocumentContext.buyer && typeof manualDocumentContext.buyer === 'object' ? manualDocumentContext.buyer : {}),
    },
    sellerDetails: {
      ...(sampleFallback.sellerDetails && typeof sampleFallback.sellerDetails === 'object' ? sampleFallback.sellerDetails : {}),
      ...(sampleFallback.seller_details && typeof sampleFallback.seller_details === 'object' ? sampleFallback.seller_details : {}),
      ...(contextOverrides.sellerDetails && typeof contextOverrides.sellerDetails === 'object' ? contextOverrides.sellerDetails : {}),
      ...(contextOverrides.seller_details && typeof contextOverrides.seller_details === 'object' ? contextOverrides.seller_details : {}),
      ...(manualDocumentContext.sellerDetails && typeof manualDocumentContext.sellerDetails === 'object' ? manualDocumentContext.sellerDetails : {}),
    },
    contact: {
      ...(sampleFallback.contact && typeof sampleFallback.contact === 'object' ? sampleFallback.contact : {}),
      ...(contextOverrides.contact && typeof contextOverrides.contact === 'object' ? contextOverrides.contact : {}),
      ...(contactId ? { id: contactId, contact_id: contactId } : {}),
    },
    unit: {
      ...(sampleFallback.unit && typeof sampleFallback.unit === 'object' ? sampleFallback.unit : {}),
      ...(contextOverrides.unit && typeof contextOverrides.unit === 'object' ? contextOverrides.unit : {}),
      ...(unitId ? { id: unitId, unit_id: unitId } : {}),
    },
    privateListing: {
      ...(sampleFallback.privateListing && typeof sampleFallback.privateListing === 'object' ? sampleFallback.privateListing : {}),
      ...(sampleFallback.private_listing && typeof sampleFallback.private_listing === 'object' ? sampleFallback.private_listing : {}),
      ...(contextOverrides.privateListing && typeof contextOverrides.privateListing === 'object' ? contextOverrides.privateListing : {}),
      ...(contextOverrides.private_listing && typeof contextOverrides.private_listing === 'object' ? contextOverrides.private_listing : {}),
      ...(privateListingId ? { id: privateListingId, private_listing_id: privateListingId } : {}),
    },
    private_listing: {
      ...(sampleFallback.private_listing && typeof sampleFallback.private_listing === 'object' ? sampleFallback.private_listing : {}),
      ...(sampleFallback.privateListing && typeof sampleFallback.privateListing === 'object' ? sampleFallback.privateListing : {}),
      ...(contextOverrides.private_listing && typeof contextOverrides.private_listing === 'object' ? contextOverrides.private_listing : {}),
      ...(contextOverrides.privateListing && typeof contextOverrides.privateListing === 'object' ? contextOverrides.privateListing : {}),
      ...(privateListingId ? { id: privateListingId, private_listing_id: privateListingId } : {}),
    },
    onboardingFormData: {
      ...(sampleFallback.onboardingFormData && typeof sampleFallback.onboardingFormData === 'object' ? sampleFallback.onboardingFormData : {}),
      ...(contextOverrides.onboardingFormData && typeof contextOverrides.onboardingFormData === 'object' ? contextOverrides.onboardingFormData : {}),
      ...(manualDocumentContext.onboardingFormData && typeof manualDocumentContext.onboardingFormData === 'object' ? manualDocumentContext.onboardingFormData : {}),
      ...addendumDetails,
      ...(addendumDetails.occupation_date ? { occupationDate: addendumDetails.occupation_date } : {}),
      ...(addendumDetails.transfer_date ? { transferDate: addendumDetails.transfer_date } : {}),
    },
    mandateDraft: {
      ...(sampleFallback.mandateDraft && typeof sampleFallback.mandateDraft === 'object' ? sampleFallback.mandateDraft : {}),
      ...mandateDraftOverrides,
      ...(manualDocumentContext.mandateDraft && typeof manualDocumentContext.mandateDraft === 'object' ? manualDocumentContext.mandateDraft : {}),
      ...addendumDetails,
      ...(addendumSpecialConditions ? { specialConditions: addendumSpecialConditions } : {}),
      ...(addendumDetails.annexures_list ? { annexuresList: addendumDetails.annexures_list } : {}),
    },
    mandateData: {
      ...(sampleFallback.mandateData && typeof sampleFallback.mandateData === 'object' ? sampleFallback.mandateData : {}),
      ...mandateDataOverrides,
      ...(manualDocumentContext.mandateData && typeof manualDocumentContext.mandateData === 'object' ? manualDocumentContext.mandateData : {}),
      ...(addendumDetails.purchase_price ? { askingPrice: addendumDetails.purchase_price, purchasePrice: addendumDetails.purchase_price } : {}),
      ...(addendumSpecialConditions ? { specialConditions: addendumSpecialConditions } : {}),
      ...(addendumDetails.annexures_list ? { annexuresList: addendumDetails.annexures_list } : {}),
      sourceContext,
    },
    otpDraft: {
      ...(sampleFallback.otpDraft && typeof sampleFallback.otpDraft === 'object' ? sampleFallback.otpDraft : {}),
      ...(contextOverrides.otpDraft && typeof contextOverrides.otpDraft === 'object' ? contextOverrides.otpDraft : {}),
      ...(manualDocumentContext.otpDraft && typeof manualDocumentContext.otpDraft === 'object' ? manualDocumentContext.otpDraft : {}),
    },
    generatedDataSnapshot: {
      ...(sampleFallback.generatedDataSnapshot && typeof sampleFallback.generatedDataSnapshot === 'object' ? sampleFallback.generatedDataSnapshot : {}),
      ...(contextOverrides.generatedDataSnapshot && typeof contextOverrides.generatedDataSnapshot === 'object' ? contextOverrides.generatedDataSnapshot : {}),
      ...(manualDocumentContext.generatedDataSnapshot && typeof manualDocumentContext.generatedDataSnapshot === 'object' ? manualDocumentContext.generatedDataSnapshot : {}),
    },
    specialConditions: addendumSpecialConditions || manualDocumentContext.specialConditions || contextOverrides.specialConditions || sampleFallback.specialConditions || '',
    sourceContext,
    documentRun: {
      sourceType,
      sourceMode: documentStartSourceMode,
      documentStart,
      documentKind,
      documentKindLabel,
      manualDraftCaptured: Boolean(usesManualDraftContext),
      linkedClientKey,
      linkedPropertyKey,
      privateListingId,
      parentDocumentId,
      parentDocumentReference,
      documentChangeSummary,
      addendumType: addendumConfig.key,
      addendumLabel: addendumConfig.label,
      addendumDetails,
      title: normalizeText(runForm.title),
      createdFromStudio: true,
    },
  }
  const previewTemplate = buildPreviewTemplateFromForm({
    selectedTemplate,
    templateDetail,
    form,
    packetType,
    moduleType,
    validationSummary,
  })
  const title = normalizeText(runForm.title)
    || (documentKind === 'standard'
      ? `${templateTypeConfig.shortLabel || String(packetType).toUpperCase()} document run`
      : `${documentKindLabel} - ${templateTypeConfig.shortLabel || String(packetType).toUpperCase()}`)

  return {
    context,
    sourceContext,
    previewTemplate,
    title,
    documentKind,
    documentKindLabel,
    references: {
      transactionId,
      leadId,
      contactId,
      dealId,
      unitId,
      privateListingId,
      parentDocumentId,
      addendumType: addendumConfig.key,
    },
  }
}

function getPacketSourceContext(packet = {}) {
  return packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : {}
}

function getAddendumGenerationReadinessForPacket(packet = {}) {
  const review = buildAddendumDocumentReviewSummary(getPacketSourceContext(packet))
  if (!review.visible) {
    return {
      ready: true,
      items: [],
      capturedDetailCount: 0,
    }
  }
  const addendumConfig = getAddendumDetailConfig(review.addendumType)
  return getDocumentRunReadiness({
    documentRunForm: {
      documentKind: review.documentKind,
      parentDocumentId: review.parentDocumentId,
      parentDocumentReference: review.parentDocumentReference,
      documentChangeSummary: review.documentChangeSummary,
      addendumType: review.addendumType,
      addendumDetails: review.manifest?.details || {},
    },
    addendumDetailFields: addendumConfig.fields,
  })
}

function buildDocumentRunContextFromPacket(packet = {}) {
  const sourceContext = getPacketSourceContext(packet)
  if (sourceContext.contractStudioPreviewContext && typeof sourceContext.contractStudioPreviewContext === 'object') {
    return sourceContext.contractStudioPreviewContext
  }
  const nestedSource = sourceContext.sourceContext && typeof sourceContext.sourceContext === 'object'
    ? sourceContext.sourceContext
    : sourceContext
  const transactionId = normalizeText(packet?.transaction_id || sourceContext.transactionId || sourceContext.transaction_id)
  const leadId = normalizeText(packet?.lead_id || sourceContext.leadId || sourceContext.lead_id)
  const contactId = normalizeText(packet?.contact_id || sourceContext.contactId || sourceContext.contact_id)
  const dealId = normalizeText(packet?.deal_id || sourceContext.dealId || sourceContext.deal_id)
  const unitId = normalizeText(packet?.unit_id || sourceContext.unitId || sourceContext.unit_id)
  const privateListingId = normalizeText(sourceContext.privateListingId || sourceContext.private_listing_id)
  const documentKind = getDocumentKindOption(sourceContext.documentKind || sourceContext.document_kind).key
  const documentKindLabel = getDocumentKindOption(documentKind).label
  const parentDocumentId = normalizeText(sourceContext.parentDocumentId || sourceContext.parent_document_id || sourceContext.linkedDocumentId || sourceContext.linked_document_id)
  const parentDocumentReference = normalizeText(sourceContext.parentDocumentReference || sourceContext.parent_document_reference)
  const documentChangeSummary = normalizeText(sourceContext.documentChangeSummary || sourceContext.document_change_summary)
  const addendumType = getAddendumDetailConfig(sourceContext.addendumType || sourceContext.addendum_type).key
  const addendumDetails = normalizeAddendumRunDetails(addendumType, sourceContext.addendumDetails || sourceContext.addendum_details || sourceContext)
  return {
    transactionId,
    leadId,
    contactId,
    dealId,
    unitId,
    transaction: transactionId ? { id: transactionId, transaction_id: transactionId } : {},
    lead: leadId ? { id: leadId, lead_id: leadId } : {},
    contact: contactId ? { id: contactId, contact_id: contactId } : {},
    unit: unitId ? { id: unitId, unit_id: unitId } : {},
    privateListing: privateListingId ? { id: privateListingId, private_listing_id: privateListingId } : {},
    private_listing: privateListingId ? { id: privateListingId, private_listing_id: privateListingId } : {},
    sourceContext: nestedSource,
    documentRun: {
      sourceType: sourceContext.sourceType || (transactionId ? 'transaction' : leadId ? 'lead' : 'manual'),
      documentKind,
      documentKindLabel,
      parentDocumentId,
      parentDocumentReference,
      documentChangeSummary,
      privateListingId,
      addendumType,
      addendumLabel: getAddendumDetailConfig(addendumType).label,
      addendumDetails,
      title: packet?.title || '',
      createdFromStudio: Boolean(sourceContext.contractStudioRun || sourceContext.contractStudioPreviewContext),
    },
  }
}

function getPacketVersionArtifactUrl(version = {}) {
  return normalizeText(
    version?.final_signed_file_access_url ||
      version?.final_signed_file_url ||
      version?.rendered_file_access_url ||
      version?.rendered_file_url,
  )
}

function getPacketVersionArtifactLabel(version = {}) {
  if (normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url)) return 'Open final'
  if (normalizeText(version?.rendered_file_access_url || version?.rendered_file_url)) return 'Open generated'
  return 'No artifact'
}

function getLatestGeneratedPacketVersion(versions = []) {
  return (Array.isArray(versions) ? versions : []).find((version) => normalizeText(version?.render_status).toLowerCase() === 'generated') || null
}

const STUDIO_VARIABLE_GROUPS = [
  { key: 'buyer', label: 'Buyer', categories: ['Buyer Details'] },
  { key: 'seller', label: 'Seller', categories: ['Seller Details'] },
  { key: 'property', label: 'Property', categories: ['Property Details'] },
  { key: 'finance', label: 'Finance', categories: ['Transaction Terms', 'Mandate Terms'] },
  { key: 'commission', label: 'Commission', categories: ['Commission'] },
  {
    key: 'more',
    label: 'More Variables',
    categories: [
      'Agent / Agency',
      'Developer',
      'Attorney / Conveyancer',
      'Signing',
      'Branding',
      'Commercial Context',
      'Landlord / Owner Company',
      'Asset Manager / Signatory',
      'Commercial / Office',
      'Industrial',
      'Retail',
      'Agricultural',
      'Document Metadata',
    ],
  },
]

function formatDateTime(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return '—'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toLocaleString()
}

function formatDateOnly(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return '—'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toLocaleDateString()
}

function humanizeKey(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  return normalized
    .replace(/[_.-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()
      if (['ID', 'OTP', 'VAT', 'FICA', 'POPIA'].includes(upper)) return upper
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function getTokenLabelMap(fields = []) {
  return (fields || []).reduce((accumulator, field) => {
    const key = normalizeTemplateTokenKey(field?.key || field?.placeholder_key)
    if (!key) return accumulator
    accumulator[key] = normalizeText(field?.label || field?.displayLabel) || humanizeKey(key)
    return accumulator
  }, {})
}

function getFieldOptionLabel(field = {}, tokenLabelByKey = {}) {
  const key = normalizeTemplateTokenKey(field?.key || field?.placeholder_key || field)
  return tokenLabelByKey[key] || normalizeText(field?.label || field?.displayLabel) || humanizeKey(key)
}

function normalizeConditionRule(condition = {}, fallbackField = '') {
  const normalized = normalizeVisibilityConditionInput(condition, normalizeTemplateTokenKey(fallbackField), { defaultOperator: 'equals' })
  return {
    ...normalized,
    field: normalizeTemplateTokenKey(normalized.field),
  }
}

function isCoreConditionRuleLocked(section = {}) {
  const metadata = section?.metadataJson && typeof section.metadataJson === 'object'
    ? section.metadataJson
    : section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : {}
  return metadata.condition_rule_locked === true || metadata.conditionRuleLocked === true
}

function isConditionalMasterPackSection(section = {}) {
  const metadata = section?.metadataJson && typeof section.metadataJson === 'object'
    ? section.metadataJson
    : section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : {}
  return metadata.conditional_pack === true
}

const CONDITIONAL_PACK_PROTECTED_SECTION_FIELDS = new Set([
  'conditionJson',
  'condition_json',
  'sectionKey',
  'section_key',
  'sectionLabel',
  'section_label',
  'sectionType',
  'section_type',
  'sortOrder',
  'sort_order',
  'placeholderKeys',
  'placeholder_keys',
  'placeholderKeysText',
  'isRequired',
  'is_required',
])

function describeConditionRule(condition = {}, tokenLabelByKey = {}) {
  const rule = normalizeConditionRule(condition)
  if (!rule.enabled || !rule.field) return 'Always include this section.'
  const fieldLabel = tokenLabelByKey[rule.field] || humanizeKey(rule.field)
  const operatorLabel = CONDITION_OPERATOR_LABELS[rule.operator] || rule.operator
  if (VISIBILITY_VALUELESS_OPERATORS.includes(rule.operator)) {
    return `Include when ${fieldLabel} ${operatorLabel}.`
  }
  return `Include when ${fieldLabel} ${operatorLabel} ${rule.value || 'the chosen value'}.`
}

function normalizeSigningFieldType(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return SIGNING_FIELD_TYPE_OPTIONS.some((item) => item.key === normalized) ? normalized : 'signature'
}

function normalizeSignerRole(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return SIGNER_ROLE_OPTIONS.some((item) => item.key === normalized) ? normalized : 'other'
}

function normalizeSigningNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getSigningFieldTypeConfig(fieldType = 'signature') {
  return SIGNING_FIELD_TYPE_OPTIONS.find((item) => item.key === normalizeSigningFieldType(fieldType)) || SIGNING_FIELD_TYPE_OPTIONS[0]
}

function getSignerRoleLabel(role = '') {
  return SIGNER_ROLE_OPTIONS.find((item) => item.key === normalizeSignerRole(role))?.label || humanizeKey(role)
}

function getSigningFieldTypeLabel(fieldType = '') {
  return getSigningFieldTypeConfig(fieldType).label
}

function normalizeSigningFieldPlan(field = {}, index = 0) {
  const fieldType = normalizeSigningFieldType(field.fieldType || field.field_type)
  const typeConfig = getSigningFieldTypeConfig(fieldType)
  return {
    id: normalizeText(field.id || field.key || field.fieldId || field.field_id || `planned_field_${index + 1}`),
    signerRole: normalizeSignerRole(field.signerRole || field.signer_role || field.role || 'purchaser_1'),
    fieldType,
    pageNumber: Math.max(1, Math.trunc(normalizeSigningNumber(field.pageNumber ?? field.page_number, 1))),
    xPosition: normalizeSigningNumber(field.xPosition ?? field.x_position, SIGNING_FIELD_POSITION_PRESETS[0].x),
    yPosition: normalizeSigningNumber(field.yPosition ?? field.y_position, SIGNING_FIELD_POSITION_PRESETS[0].y),
    width: Math.max(18, normalizeSigningNumber(field.width, typeConfig.width)),
    height: Math.max(14, normalizeSigningNumber(field.height, typeConfig.height)),
    required: field.required === undefined ? true : Boolean(field.required),
    label: normalizeText(field.label),
  }
}

function getSigningFieldPreviewLayout(fields = []) {
  const placed = []
  return (Array.isArray(fields) ? fields : [])
    .map((field) => normalizeSigningFieldPlan(field))
    .map((field) => {
      const width = Math.min(field.width, SIGNING_FIELD_PAGE.width - 24)
      const height = Math.min(field.height, SIGNING_FIELD_PAGE.height - 24)
      const rect = {
        ...field,
        previewX: Math.min(SIGNING_FIELD_PAGE.width - width - 8, Math.max(8, field.xPosition)),
        previewY: Math.min(SIGNING_FIELD_PAGE.height - height - 8, Math.max(8, field.yPosition)),
        previewWidth: width,
        previewHeight: height,
      }
      let guard = 0
      while (
        placed.some((placedRect) => (
          placedRect.pageNumber === rect.pageNumber &&
          rect.previewX < placedRect.previewX + placedRect.previewWidth + 8 &&
          rect.previewX + rect.previewWidth + 8 > placedRect.previewX &&
          rect.previewY < placedRect.previewY + placedRect.previewHeight + 8 &&
          rect.previewY + rect.previewHeight + 8 > placedRect.previewY
        )) &&
        guard < 20
      ) {
        const nextY = rect.previewY + rect.previewHeight + 10
        if (nextY + rect.previewHeight > SIGNING_FIELD_PAGE.height - 8) {
          rect.previewY = Math.max(8, rect.previewY - rect.previewHeight - 10)
          rect.previewX = Math.max(8, rect.previewX - 18)
        } else {
          rect.previewY = nextY
        }
        guard += 1
      }
      placed.push(rect)
      return rect
    })
}

function resolveSigningFieldPlanCollisions(fields = []) {
  const placed = []
  return (Array.isArray(fields) ? fields : [])
    .map((field, index) => normalizeSigningFieldPlan(field, index))
    .map((field) => {
      const width = Math.min(field.width, SIGNING_FIELD_PAGE.width - 24)
      const height = Math.min(field.height, SIGNING_FIELD_PAGE.height - 24)
      const rect = {
        ...field,
        width,
        height,
        xPosition: Math.min(SIGNING_FIELD_PAGE.width - width - 8, Math.max(8, field.xPosition)),
        yPosition: Math.min(SIGNING_FIELD_PAGE.height - height - 8, Math.max(8, field.yPosition)),
      }
      let guard = 0
      while (
        placed.some((placedRect) => (
          placedRect.pageNumber === rect.pageNumber &&
          rect.xPosition < placedRect.xPosition + placedRect.width + 8 &&
          rect.xPosition + rect.width + 8 > placedRect.xPosition &&
          rect.yPosition < placedRect.yPosition + placedRect.height + 8 &&
          rect.yPosition + rect.height + 8 > placedRect.yPosition
        )) &&
        guard < 20
      ) {
        const nextY = rect.yPosition + rect.height + 10
        if (nextY + rect.height > SIGNING_FIELD_PAGE.height - 8) {
          const nextX = rect.xPosition + rect.width + 14
          rect.xPosition = nextX + rect.width > SIGNING_FIELD_PAGE.width - 8 ? 8 : nextX
          rect.yPosition = 24 + (guard % 4) * (rect.height + 12)
        } else {
          rect.yPosition = nextY
        }
        guard += 1
      }
      placed.push(rect)
      return rect
    })
}

function getSigningFieldsFromMetadata(metadata = {}, section = {}) {
  const signing = metadata?.signing && typeof metadata.signing === 'object' ? metadata.signing : {}
  const source = Array.isArray(section.signingFields)
    ? section.signingFields
    : Array.isArray(section.signing_fields)
      ? section.signing_fields
      : Array.isArray(signing.planned_fields)
        ? signing.planned_fields
        : Array.isArray(signing.plannedFields)
          ? signing.plannedFields
          : Array.isArray(signing.signing_fields)
            ? signing.signing_fields
          : []
  return source.map((field, index) => normalizeSigningFieldPlan(field, index))
}

function stableStringify(value) {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(',')}}`
}

function getSectionGovernance(section = {}) {
  const metadata = section?.metadataJson && typeof section.metadataJson === 'object'
    ? section.metadataJson
    : section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : {}
  const governance = metadata.governance && typeof metadata.governance === 'object' ? metadata.governance : {}
  return {
    locked: Boolean(governance.locked),
    lockReason: normalizeText(governance.lockReason || governance.lock_reason),
    lockedByRole: normalizeText(governance.lockedByRole || governance.locked_by_role || 'principal') || 'principal',
    lockedAt: normalizeText(governance.lockedAt || governance.locked_at),
  }
}

function hasPublishingAuthority({ appRole = '', membershipRole = '', workspaceMembershipRole = '', canEdit = false } = {}) {
  if (!canEdit) return false
  const roles = [appRole, membershipRole, workspaceMembershipRole].map((item) => normalizeText(item).toLowerCase())
  return roles.some((item) => ['developer', 'owner', 'principal', 'admin', 'super_admin', 'super admin'].includes(item))
}

function sectionChanged(currentSection = {}, baselineSection = {}) {
  if (!baselineSection) return true
  return [
    'sectionKey',
    'sectionLabel',
    'sectionType',
    'legalText',
    'placeholderKeysText',
    'isRequired',
    'signingRequirement',
    'initialPlaceholderKey',
    'signaturePlaceholderKey',
  ].some((key) => stableStringify(currentSection?.[key]) !== stableStringify(baselineSection?.[key]))
    || stableStringify(currentSection?.conditionJson || {}) !== stableStringify(baselineSection?.conditionJson || {})
    || stableStringify(getSigningFieldsFromMetadata(currentSection?.metadataJson || {}, currentSection)) !== stableStringify(getSigningFieldsFromMetadata(baselineSection?.metadataJson || {}, baselineSection))
    || stableStringify(getSectionGovernance(currentSection)) !== stableStringify(getSectionGovernance(baselineSection))
}

function getFriendlySectionLabel(section = {}, index = 0) {
  const current = normalizeText(section.sectionLabel)
  if (current && !/^parties$/i.test(current) && !/^purchase terms$/i.test(current)) return current
  return SIMPLE_SECTION_LABELS[index] || current || `Section ${index + 1}`
}

function getSectionDescription(section = {}, index = 0) {
  const label = getFriendlySectionLabel(section, index).toLowerCase()
  return SECTION_HELP_TEXT[label] || 'Edit the wording and auto-filled information for this part of the document.'
}

function buildLegalConditionCoverage(sections = []) {
  const normalizedSections = (Array.isArray(sections) ? sections : []).map((section, index) => {
    const sectionKey = normalizeText(section.sectionKey || section.section_key).toLowerCase()
    const sectionLabel = getFriendlySectionLabel(section, index)
    const legalText = normalizeText(section.legalText || section.legal_text).toLowerCase()
    const placeholderText = normalizeText(section.placeholderKeysText || '').toLowerCase()
    return {
      index,
      section,
      sectionLabel,
      haystack: `${sectionKey} ${sectionLabel.toLowerCase()} ${legalText} ${placeholderText}`,
    }
  })

  const items = LEGAL_CONDITION_COVERAGE_ITEMS.map((item) => {
    const matchedSections = normalizedSections.filter((section) => (
      item.markers.some((marker) => section.haystack.includes(marker))
    ))
    return {
      ...item,
      count: matchedSections.length,
      covered: matchedSections.length > 0,
      firstSectionIndex: matchedSections[0]?.index ?? null,
      sectionLabels: matchedSections.slice(0, 3).map((section) => section.sectionLabel),
    }
  })

  const coveredCount = items.filter((item) => item.covered).length
  return {
    items,
    coveredCount,
    totalCount: items.length,
    percent: items.length ? Math.round((coveredCount / items.length) * 100) : 0,
  }
}

function getSimpleVariableCategory(field = {}) {
  const category = normalizeText(field.category).toLowerCase()
  const key = normalizeText(field.key).toLowerCase()
  if (category.includes('buyer') || key.startsWith('buyer_')) return 'Buyer information'
  if (category.includes('seller') || key.startsWith('seller_')) return 'Seller information'
  if (category.includes('property') || category.includes('asset') || key.startsWith('property_')) return 'Property information'
  if (category.includes('transaction') || category.includes('term') || category.includes('finance') || category.includes('commission') || key.includes('price') || key.includes('deposit') || key.includes('commission')) return 'Transaction details'
  if (category.includes('agent') || category.includes('agency') || category.includes('organisation') || key.startsWith('agent_') || key.startsWith('organisation_')) return 'Agency information'
  return 'Other'
}

function getSimpleDocumentTabs({ normalizedModuleType = 'agency', visiblePacketTypes = [], activeDocumentTypeKey = '' } = {}) {
  if (normalizedModuleType === 'agency') {
    return AGENCY_DOCUMENT_TABS
      .filter((tab) => visiblePacketTypes.some((item) => item.key === tab.packetType))
      .map((tab) => ({ ...tab, active: tab.key === activeDocumentTypeKey }))
  }

  return visiblePacketTypes.map((item) => ({
    key: item.key,
    packetType: item.key,
    label: item.label,
    icon: item.icon,
    active: item.key === activeDocumentTypeKey,
  }))
}

function getTemplateActorLabel(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return (
    normalizeText(
      template?.updated_by_name
      || metadata.updated_by_name
      || metadata.updatedByName
      || template?.created_by_name
      || metadata.created_by_name
      || metadata.createdByName,
    )
    || 'Not available'
  )
}

function getVariableGroups(fields = []) {
  return STUDIO_VARIABLE_GROUPS
    .map((group) => ({
      ...group,
      fields: fields.filter((field) => group.categories.includes(normalizeText(field.category))),
    }))
    .filter((group) => group.fields.length)
}

function getSectionVisualState(section = {}, packetType = 'otp') {
  const content = normalizeText(section.legalText)
  const tokenScan = detectTemplateTokenIssues(section.legalText)
  const placeholderKeys = String(section.placeholderKeysText || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
  const validation = validateTemplateTokensAgainstRegistry({
    tokens: Array.from(new Set([...tokenScan.tokens, ...placeholderKeys])),
    packetType,
  })

  if (content && tokenScan.malformed.length === 0 && (validation.unknown || []).length === 0) {
    return {
      key: 'complete',
      label: 'Complete',
      icon: <CheckCircle2 size={16} className="text-[#20b26b]" />,
    }
  }

  if (!content && section.isRequired === false) {
    return {
      key: 'optional',
      label: 'Optional',
      icon: <CircleDot size={14} className="text-[#9fb0c4]" />,
    }
  }

  return {
    key: 'attention',
    label: tokenScan.malformed.length || (validation.unknown || []).length ? 'Needs review' : 'Incomplete',
    icon: <AlertTriangle size={15} className="text-[#f5a524]" />,
  }
}

export default function SettingsSigningTemplatesPage({
  templateModuleType = 'agency',
  allowedPacketTypes = DEFAULT_ALLOWED_PACKET_TYPES,
  title = 'Document Builder',
  description = 'Create, preview, send, and manage the documents your agency uses every day.',
  initialPacketType = '',
  initialTemplateId = '',
  editorScope = 'all',
  editorSituationKey = '',
  focusedLegalDocumentKey = '',
} = {}) {
  const { role, currentWorkspace, organisationMembership, organisationMembershipRole, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const resolvedOrganisationId = normalizeText(
    currentWorkspace?.id ||
      currentWorkspace?.organisationId ||
      currentWorkspace?.organisation_id ||
      organisationMembership?.workspaceId ||
      organisationMembership?.workspace_id ||
      organisationMembership?.organisationId ||
      organisationMembership?.organisation_id,
  )
  const workspaceMembershipRole = useMemo(() => {
    const rawRole = normalizeText(
      organisationMembershipRole ||
        organisationMembership?.workspaceRole ||
        organisationMembership?.workspace_role ||
        organisationMembership?.organisationRole ||
        organisationMembership?.organisation_role ||
        organisationMembership?.role ||
        organisationMembership?.membershipRole,
    )
    return rawRole
      ? normalizeOrganisationMembershipRole(rawRole, {
          appRole: role,
          workspaceType: resolvedWorkspaceType,
        })
      : ''
  }, [organisationMembership, organisationMembershipRole, resolvedWorkspaceType, role])
  const allowedPacketTypesKey = (
    Array.isArray(allowedPacketTypes) && allowedPacketTypes.length
      ? allowedPacketTypes
      : DEFAULT_ALLOWED_PACKET_TYPES
  )
    .map((type) => normalizeText(type).toLowerCase())
    .filter((type, index, list) => type && SUPPORTED_PACKET_TYPE_KEYS.has(type) && list.indexOf(type) === index)
    .join('|')
  const stableAllowedPacketTypes = useMemo(
    () => (allowedPacketTypesKey ? allowedPacketTypesKey.split('|') : DEFAULT_ALLOWED_PACKET_TYPES),
    [allowedPacketTypesKey],
  )
  const requestedPacketType = normalizeText(initialPacketType).toLowerCase()
  const defaultPacketType = stableAllowedPacketTypes.includes(requestedPacketType)
    ? requestedPacketType
    : stableAllowedPacketTypes[0] || 'otp'
  const normalizedEditorScope = normalizeLegalDocumentEditorScope(editorScope)
  const editorSituation = getLegalDocumentEditorSituation(editorSituationKey, { packetType: defaultPacketType })
  const isFocusedLegalDocumentEditor = Boolean(normalizeText(focusedLegalDocumentKey))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [testingTemplate, setTestingTemplate] = useState(false)
  const [creatingDocumentPacket, setCreatingDocumentPacket] = useState(false)
  const [documentPacketsLoading, setDocumentPacketsLoading] = useState(false)
  const [packetDetailLoading, setPacketDetailLoading] = useState(false)
  const [signingSummaryLoading, setSigningSummaryLoading] = useState(false)
  const [documentLibraryStartOpen, setDocumentLibraryStartOpen] = useState(false)
  const [templateStarterMenuOpen, setTemplateStarterMenuOpen] = useState(false)
  const [blankTemplateForm, setBlankTemplateForm] = useState(() => createBlankTemplateForm(defaultPacketType))
  const [packetActionId, setPacketActionId] = useState('')
  const [savingPlaceholder, setSavingPlaceholder] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const documentGenerationFailureCountsRef = useRef(new Map())
  const recordedDocumentGenerationHandoffsRef = useRef(new Set())
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [packetType, setPacketType] = useState(defaultPacketType)
  const [activeDocumentTypeKey, setActiveDocumentTypeKey] = useState(defaultPacketType)
  const [templatesByType, setTemplatesByType] = useState({})
  const [placeholdersByType, setPlaceholdersByType] = useState({})
  const [documentPackets, setDocumentPackets] = useState([])
  const [selectedLibraryPacketId, setSelectedLibraryPacketId] = useState('')
  const [selectedLibraryPacketDetail, setSelectedLibraryPacketDetail] = useState(null)
  const [selectedPacketSigningSummary, setSelectedPacketSigningSummary] = useState(null)
  const [signingLinksResult, setSigningLinksResult] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => normalizeText(initialTemplateId))
  const [templateDetail, setTemplateDetail] = useState(null)
  const [form, setForm] = useState(toTemplateForm(null))
  const [documentRunForm, setDocumentRunForm] = useState(createDefaultDocumentRunForm(defaultPacketType))
  const [documentLinkOptions, setDocumentLinkOptions] = useState({ clients: [], properties: [] })
  const [documentLinkOptionsLoading, setDocumentLinkOptionsLoading] = useState(false)
  const [documentLinkOptionsError, setDocumentLinkOptionsError] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [creatingMandateVariants, setCreatingMandateVariants] = useState(false)
  const [placeholderForm, setPlaceholderForm] = useState({
    placeholderKey: '',
    entityScope: 'transaction',
    dataType: 'text',
    description: '',
    exampleValue: '',
    isRequiredDefault: false,
    isActive: true,
  })
  const [previewState, setPreviewState] = useState({ loading: false, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
  const [templatePreviewScenarioKey, setTemplatePreviewScenarioKey] = useState('company')
  const [mergeFieldSearch, setMergeFieldSearch] = useState('')
  const [mergeFieldCategory, setMergeFieldCategory] = useState('all')
  const [activeStudioArea, setActiveStudioArea] = useState('templates')
  const [activeTab, setActiveTab] = useState('template')
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0)
  const [selectedCanvasBlockIndex, setSelectedCanvasBlockIndex] = useState(0)
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)
  const [editorToolsCollapsed, setEditorToolsCollapsed] = useState(true)
  const [showSourceEditor, setShowSourceEditor] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [publishReviewAccepted, setPublishReviewAccepted] = useState(false)
  const [pendingSectionTitleFocus, setPendingSectionTitleFocus] = useState(false)
  const clauseTextareaRef = useRef(null)
  const sectionTitleInputRef = useRef(null)
  const autoDraftSourceTemplateRef = useRef('')

  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole, workspaceType: resolvedWorkspaceType })
  const simpleDocumentBuilderEnabled = isSimpleDocumentBuilderEnabled()
  const visiblePacketTypes = useMemo(() => SUPPORTED_PACKET_TYPES.filter((item) => stableAllowedPacketTypes.includes(item.key)), [stableAllowedPacketTypes])
  const normalizedModuleType = normalizeText(templateModuleType || 'agency').toLowerCase() || 'agency'
  const visibleDescription = normalizedModuleType === 'agency' && !isFocusedLegalDocumentEditor
    ? 'Choose the templates your agency uses for offers, mandates, and related documents.'
    : description
  const loadDocumentLinkOptions = useCallback(async () => {
    if (!resolvedOrganisationId) {
      setDocumentLinkOptions({ clients: [], properties: [] })
      setDocumentLinkOptionsError('')
      return
    }

    setDocumentLinkOptionsLoading(true)
    setDocumentLinkOptionsError('')

    const [crmResult, listingsResult] = await Promise.allSettled([
      listAgencyCrmLeadContacts(resolvedOrganisationId),
      getOrganisationPrivateListings(resolvedOrganisationId, { includeRequirementsAndDocuments: false }),
    ])

    const crmSnapshot = crmResult.status === 'fulfilled' ? crmResult.value || {} : {}
    const listings = listingsResult.status === 'fulfilled' ? listingsResult.value || [] : []
    setDocumentLinkOptions({
      clients: buildDocumentClientLinkOptions(crmSnapshot),
      properties: buildDocumentPropertyLinkOptions(listings),
    })

    if (crmResult.status === 'rejected' || listingsResult.status === 'rejected') {
      setDocumentLinkOptionsError('Some saved records could not be loaded. You can still enter the details manually.')
    }
    setDocumentLinkOptionsLoading(false)
  }, [resolvedOrganisationId])

  useEffect(() => {
    void loadDocumentLinkOptions()
  }, [loadDocumentLinkOptions])

  const loadTemplatesAndRegistry = useCallback(async ({
    targetPacketType = defaultPacketType,
    preferredTemplateId = '',
  } = {}) => {
    const templateRows = await Promise.all(stableAllowedPacketTypes.map(async (type) => ([
      type,
      await listDocumentPacketTemplates({
        packetType: type,
        moduleType: normalizedModuleType,
        includeInactive: true,
      }),
    ])))
    const placeholderRows = await Promise.all(stableAllowedPacketTypes.map(async (type) => ([
      type,
      await listDocumentPlaceholderDefinitions({
        packetType: type,
        includeInactive: true,
      }).catch(() => []),
    ])))

    const nextByType = templateRows.reduce((accumulator, [type, rows]) => {
      accumulator[type] = withDefaultLegalTemplateStarter(rows || [], type, normalizedModuleType).sort(templateSort)
      return accumulator
    }, {})

    setTemplatesByType(nextByType)
    setPlaceholdersByType(placeholderRows.reduce((accumulator, [type, rows]) => {
      accumulator[type] = rows || []
      return accumulator
    }, {}))

    const selectedList = nextByType[targetPacketType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      setHasUnsavedChanges(false)
      return
    }

    const currentStillExists = selectedList.some((item) => item.id === preferredTemplateId)
    setSelectedTemplateId(currentStillExists ? preferredTemplateId : selectedList[0].id)
  }, [defaultPacketType, normalizedModuleType, stableAllowedPacketTypes])

  const loadDocumentLibrary = useCallback(async ({ targetPacketType = packetType } = {}) => {
    try {
      setDocumentPacketsLoading(true)
      const rows = await listDocumentPackets({
        packetType: targetPacketType,
        limit: 30,
      })
      setDocumentPackets(rows || [])
    } catch (libraryError) {
      console.warn('[Document Builder] Unable to load document library.', libraryError)
      setDocumentPackets([])
    } finally {
      setDocumentPacketsLoading(false)
    }
  }, [packetType])

  const loadLibraryPacketDetail = useCallback(async (packetId = '') => {
    const resolvedPacketId = normalizeText(packetId)
    if (!resolvedPacketId) {
      setSelectedLibraryPacketDetail(null)
      return
    }
    try {
      setPacketDetailLoading(true)
      const detail = await fetchDocumentPacket(resolvedPacketId, {
        includeVersions: true,
        includeEvents: true,
      })
      setSelectedLibraryPacketDetail(detail || null)
    } catch (detailError) {
      console.warn('[Document Builder] Unable to load document detail.', detailError)
      setSelectedLibraryPacketDetail(null)
      setError(detailError?.message || 'Unable to load document details.')
    } finally {
      setPacketDetailLoading(false)
    }
  }, [])

  const loadLibraryPacketSigningSummary = useCallback(async ({ packetId = '', packetVersionId = '' } = {}) => {
    const resolvedPacketId = normalizeText(packetId)
    const resolvedVersionId = normalizeText(packetVersionId)
    if (!resolvedPacketId || !resolvedVersionId) {
      setSelectedPacketSigningSummary(null)
      return
    }
    try {
      setSigningSummaryLoading(true)
      const summary = await getPacketSigningSummary({
        packetId: resolvedPacketId,
        packetVersionId: resolvedVersionId,
      })
      setSelectedPacketSigningSummary(summary || null)
    } catch (summaryError) {
      console.warn('[Document Builder] Unable to load packet signing summary.', summaryError)
      setSelectedPacketSigningSummary(null)
    } finally {
      setSigningSummaryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!stableAllowedPacketTypes.includes(packetType)) {
      setPacketType(defaultPacketType)
      setActiveDocumentTypeKey(defaultPacketType)
    }
  }, [defaultPacketType, packetType, stableAllowedPacketTypes])

  useEffect(() => {
    const tabs = getSimpleDocumentTabs({ normalizedModuleType, visiblePacketTypes, activeDocumentTypeKey })
    if (!tabs.length) return
    const activeTabExists = tabs.some((tab) => tab.key === activeDocumentTypeKey && tab.packetType === packetType)
    if (!activeTabExists) {
      const matchingTab = tabs.find((tab) => tab.packetType === packetType) || tabs[0]
      setActiveDocumentTypeKey(matchingTab.key)
    }
  }, [activeDocumentTypeKey, normalizedModuleType, packetType, visiblePacketTypes])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError('')
        if (workspaceMembershipRole) {
          setMembershipRole(workspaceMembershipRole)
        } else {
          const context = await fetchOrganisationSettings()
          if (!active) return
          setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole, {
            appRole: role,
            workspaceType: context?.organisation?.type || resolvedWorkspaceType,
          }))
        }
        await loadTemplatesAndRegistry({
          targetPacketType: defaultPacketType,
          preferredTemplateId: normalizeText(initialTemplateId),
        })
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load Document Builder templates.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [defaultPacketType, initialTemplateId, loadTemplatesAndRegistry, resolvedWorkspaceType, role, workspaceMembershipRole])

  useEffect(() => {
    void loadDocumentLibrary({ targetPacketType: packetType })
  }, [loadDocumentLibrary, packetType])

  useEffect(() => {
    if (!documentPackets.length) {
      setSelectedLibraryPacketId('')
      setSelectedLibraryPacketDetail(null)
      return
    }
    if (!selectedLibraryPacketId || !documentPackets.some((packet) => packet.id === selectedLibraryPacketId)) {
      setSelectedLibraryPacketId(documentPackets[0].id)
    }
  }, [documentPackets, selectedLibraryPacketId])

  useEffect(() => {
    void loadLibraryPacketDetail(selectedLibraryPacketId)
  }, [loadLibraryPacketDetail, selectedLibraryPacketId])

  useEffect(() => {
    setSigningLinksResult(null)
  }, [selectedLibraryPacketId])

  useEffect(() => {
    const selectedList = templatesByType[packetType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    if (!selectedTemplateId || !selectedList.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(selectedList[0].id)
    }
  }, [packetType, selectedTemplateId, templatesByType])

  useEffect(() => {
    let active = true
    async function loadDetail() {
      if (!selectedTemplateId) {
        setTemplateDetail(null)
        setForm(toTemplateForm(null))
        setHasUnsavedChanges(false)
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
        return
      }

      try {
        setError('')
        if (isVirtualDefaultTemplateId(selectedTemplateId)) {
          const virtualPacketType = getPacketTypeFromVirtualDefaultTemplateId(selectedTemplateId) || packetType
          const detail = createDefaultLegalTemplateRecord(virtualPacketType, {
            moduleType: normalizedModuleType,
            virtual: true,
          })
          if (!active) return
          setTemplateDetail(detail)
          setForm(toTemplateForm(detail))
          setHasUnsavedChanges(false)
          setPreviewState({ loading: false, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
          return
        }
        const detail = await fetchDocumentPacketTemplate(selectedTemplateId, { includeSections: true })
        if (!active) return
        setTemplateDetail(detail)
        setForm(toTemplateForm(detail))
        setHasUnsavedChanges(false)
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
      } catch (detailError) {
        if (active) {
          setError(detailError?.message || 'Unable to load template details.')
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [normalizedModuleType, packetType, selectedTemplateId])

  useEffect(() => {
    setSelectedSectionIndex(0)
    setSelectedCanvasBlockIndex(0)
    setShowPublishConfirm(false)
    setPublishReviewAccepted(false)
  }, [selectedTemplateId])

  useEffect(() => {
    setSelectedCanvasBlockIndex(0)
  }, [selectedSectionIndex])

  useEffect(() => {
    const sectionCount = Array.isArray(form.sections) ? form.sections.length : 0
    if (!sectionCount) {
      if (selectedSectionIndex !== 0) setSelectedSectionIndex(0)
      return
    }
    if (selectedSectionIndex > sectionCount - 1) {
      setSelectedSectionIndex(sectionCount - 1)
    }
  }, [form.sections, selectedSectionIndex])

  const selectedList = useMemo(
    () => templatesByType[packetType] || [],
    [packetType, templatesByType],
  )
  const selectedTemplate = useMemo(
    () => selectedList.find((item) => item.id === selectedTemplateId) || null,
    [selectedList, selectedTemplateId],
  )
  const otpTemplateCoverageAudit = null
  const mandateVariantOptions = []
  const mandateVariantCoverageRows = []
  const liveMandateVariantCount = 0
  const missingMandateVariantOptions = []
  const mandateOperationalAudit = null
  const mandateLaunchReadiness = null
  const selectedIsPickerCustomTemplate = isTemplatePickerCustomTemplate(selectedTemplate)
  const customTemplateTabs = useMemo(
    () => stableAllowedPacketTypes
      .flatMap((type) => (templatesByType[type] || [])
        .filter((template) => isTemplatePickerCustomTemplate(template))
        .map((template) => ({
          key: `template:${template.id}`,
          packetType: type,
          template,
          label: normalizeText(template.template_label || template.templateLabel || template.template_key || template.templateKey) || 'Untitled template',
          documentKindLabel: getTemplateDocumentKind(template).label,
        })))
      .sort((left, right) => templateSort(left.template, right.template)),
    [stableAllowedPacketTypes, templatesByType],
  )
  const defaultAddendumTemplate = useMemo(
    () => getPreferredAddendumTemplateForType(selectedList),
    [selectedList],
  )
  const baselineForm = useMemo(
    () => (templateDetail ? toTemplateForm(templateDetail) : null),
    [templateDetail],
  )
  const selectedClassification = useMemo(
    () => classifyTemplateMigrationState(selectedTemplate, packetType),
    [packetType, selectedTemplate],
  )

  const selectedIsOrgOwned = Boolean(selectedTemplate?.organisation_id)
  const migrationReport = useMemo(() => {
    const rows = selectedList.map((template) => ({
      template,
      classification: classifyTemplateMigrationState(template, packetType),
    }))
    return {
      total: rows.length,
      nativeReady: rows.filter((row) => row.classification.key === 'structured_ready_native').length,
      nativeBlocked: rows.filter((row) => row.classification.key === 'structured_incomplete').length,
      legacyDocx: rows.filter((row) => row.classification.key === 'legacy_docx_only').length,
      missingRenderMode: rows.filter((row) => row.template?.organisation_id && !row.classification.explicitRenderMode).length,
      defaultTemplate: rows.find((row) => row.template?.is_default) || null,
      rows,
    }
  }, [packetType, selectedList])
  const placeholderRegistry = useMemo(
    () => placeholdersByType[packetType] || [],
    [packetType, placeholdersByType],
  )
  const canonicalFields = useMemo(
    () => listCanonicalMergeFields({ packetType }),
    [packetType],
  )
  const tokenLabelByKey = useMemo(
    () => getTokenLabelMap(canonicalFields),
    [canonicalFields],
  )
  const conditionFieldOptions = useMemo(() => {
    const preferredKeys = [
      'finance_type',
      'bond_amount',
      'purchase_price',
      'commission_structure',
      'mandate_type',
      'property_address',
      'seller_entity_type',
      'seller_marital_status',
      'seller_spouse_full_name',
      'seller_spouse_name',
      'seller_spouse_consent_required',
      'seller_company_registration_number',
      'seller_trust_registration_number',
      'seller_trustee_names',
      'seller_representative_name',
      'seller_representative_capacity',
      'seller_resolution_date',
      'seller_authority_basis',
      'buyer_entity_type',
      'buyer_marital_status',
      'buyer_spouse_full_name',
      'buyer_spouse_name',
      'buyer_spouse_consent_required',
      'buyer_company_registration_number',
      'buyer_trust_registration_number',
      'buyer_trustee_names',
      'buyer_representative_name',
      'buyer_representative_capacity',
      'buyer_resolution_date',
      'buyer_authority_basis',
      'witness_signature',
    ]
    const byKey = new Map(canonicalFields.map((field) => [normalizeTemplateTokenKey(field.key), field]))
    const preferred = preferredKeys.map((key) => byKey.get(key)).filter(Boolean)
    const remaining = canonicalFields
      .filter((field) => !preferredKeys.includes(normalizeTemplateTokenKey(field.key)))
      .slice(0, 18)
    return [...preferred, ...remaining]
  }, [canonicalFields])
  const canonicalCategories = useMemo(
    () => ['all', ...Array.from(new Set(canonicalFields.map((row) => normalizeText(row.category)).filter(Boolean)))],
    [canonicalFields],
  )
  const filteredCanonicalFields = useMemo(() => {
    const search = normalizeText(mergeFieldSearch).toLowerCase()
    return canonicalFields.filter((field) => {
      if (mergeFieldCategory !== 'all' && normalizeText(field.category) !== mergeFieldCategory) return false
      if (!search) return true
      return (
        normalizeText(field.key).toLowerCase().includes(search) ||
        normalizeText(field.label).toLowerCase().includes(search) ||
        normalizeText(field.description).toLowerCase().includes(search)
      )
    })
  }, [canonicalFields, mergeFieldCategory, mergeFieldSearch])
  const validationSummary = useMemo(
    () => summarizeTemplateValidation({
      form,
      placeholderRegistry,
      packetType,
      canonicalFields,
    }),
    [canonicalFields, form, packetType, placeholderRegistry],
  )
  const mandatePublishGateReport = useMemo(() => {
    if (packetType !== 'mandate') return null
    return buildMandateTemplatePublishGateReport({
      packet_type: 'mandate',
      packetType: 'mandate',
      template_label: form.templateLabel || selectedTemplate?.template_label || selectedTemplate?.templateLabel || '',
      metadata_json: {
        ...(form.metadataJson && typeof form.metadataJson === 'object' ? form.metadataJson : {}),
        mandate_template_variant: 'default',
        mandateTemplateVariant: 'default',
      },
      metadataJson: {
        ...(form.metadataJson && typeof form.metadataJson === 'object' ? form.metadataJson : {}),
        mandate_template_variant: 'default',
        mandateTemplateVariant: 'default',
      },
      sections: (form.sections || []).map((section, index) => mapSectionForPreview(section, index, 'mandate')),
    }, {
      packetType: 'mandate',
      routeKey: 'default',
    })
  }, [form, packetType, selectedTemplate])
  const variableGroups = useMemo(
    () => getVariableGroups(canonicalFields),
    [canonicalFields],
  )
  const simpleDocumentTabs = useMemo(
    () => getSimpleDocumentTabs({ normalizedModuleType, visiblePacketTypes, activeDocumentTypeKey }),
    [activeDocumentTypeKey, normalizedModuleType, visiblePacketTypes],
  )
  const handleSelectPrimaryTemplateTab = useCallback((item) => {
    const primaryTemplate = getPrimaryTemplateForPicker(templatesByType[item.packetType] || [])
    setActiveStudioArea('templates')
    setActiveDocumentTypeKey(item.key)
    setPacketType(item.packetType)
    if (primaryTemplate?.id) {
      setSelectedTemplateId(primaryTemplate.id)
    }
    setActiveTab('template')
    setTemplateStarterMenuOpen(false)
  }, [templatesByType])
  const scopedSectionEntries = useMemo(
    () => listScopedLegalDocumentSectionEntries(form.sections || [], {
      scope: normalizedEditorScope,
      packetType,
      situationKey: editorSituation?.key || '',
    }),
    [editorSituation?.key, form.sections, normalizedEditorScope, packetType],
  )
  const selectedSection = useMemo(
    () => {
      const candidate = Array.isArray(form.sections) ? form.sections[selectedSectionIndex] || null : null
      if (normalizedEditorScope === 'all') return candidate
      return scopedSectionEntries.some((entry) => entry.index === selectedSectionIndex) ? candidate : null
    },
    [form.sections, normalizedEditorScope, scopedSectionEntries, selectedSectionIndex],
  )

  useEffect(() => {
    if (normalizedEditorScope === 'all' || !scopedSectionEntries.length) return
    if (scopedSectionEntries.some((entry) => entry.index === selectedSectionIndex)) return
    setSelectedSectionIndex(scopedSectionEntries[0].index)
  }, [normalizedEditorScope, scopedSectionEntries, selectedSectionIndex])

  useEffect(() => {
    if (!pendingSectionTitleFocus || !selectedSection) return
    requestAnimationFrame(() => {
      sectionTitleInputRef.current?.focus?.()
      sectionTitleInputRef.current?.select?.()
    })
    setPendingSectionTitleFocus(false)
  }, [pendingSectionTitleFocus, selectedSection])

  useEffect(() => {
    setShowSourceEditor(false)
  }, [selectedSectionIndex])

  const selectedSectionDescription = selectedSection ? getSectionDescription(selectedSection, selectedSectionIndex) : ''
  const selectedSectionText = String(selectedSection?.legalText || '')
  const selectedSectionCanvasBlocks = useMemo(
    () => parseTemplateEditorDocumentBlocks(selectedSectionText),
    [selectedSectionText],
  )
  const selectedCanvasBlock = selectedSectionCanvasBlocks[selectedCanvasBlockIndex] || null

  useEffect(() => {
    if (!selectedSectionCanvasBlocks.length) {
      if (selectedCanvasBlockIndex !== 0) setSelectedCanvasBlockIndex(0)
      return
    }
    if (selectedCanvasBlockIndex > selectedSectionCanvasBlocks.length - 1) {
      setSelectedCanvasBlockIndex(selectedSectionCanvasBlocks.length - 1)
    }
  }, [selectedCanvasBlockIndex, selectedSectionCanvasBlocks.length])
  const selectedSectionWordCount = selectedSectionText.trim() ? selectedSectionText.trim().split(/\s+/).length : 0
  const selectedSectionCharacterCount = selectedSectionText.length
  const sectionStatuses = useMemo(
    () => (form.sections || []).map((section) => getSectionVisualState(section, packetType)),
    [form.sections, packetType],
  )
  const legalConditionCoverage = useMemo(
    () => buildLegalConditionCoverage(form.sections || []),
    [form.sections],
  )
  const selectedSectionTokens = useMemo(() => {
    if (!selectedSection) return []
    const tokenScan = detectTemplateTokenIssues(selectedSection.legalText)
    const placeholderKeys = String(selectedSection.placeholderKeysText || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)
    return Array.from(new Set([...(selectedSection.placeholderKeys || []), ...placeholderKeys, ...tokenScan.tokens]))
  }, [selectedSection])
  const selectedSectionTokenDetails = useMemo(
    () => selectedSectionTokens.map((token) => ({
      key: token,
      label: tokenLabelByKey[token] || humanizeKey(token),
    })),
    [selectedSectionTokens, tokenLabelByKey],
  )
  const selectedSectionUnknownTokens = useMemo(
    () => validateTemplateTokensAgainstRegistry({ tokens: selectedSectionTokens, packetType }).unknown || [],
    [packetType, selectedSectionTokens],
  )
  const selectedSectionCondition = useMemo(
    () => normalizeConditionRule(selectedSection?.conditionJson, conditionFieldOptions[0]?.key || ''),
    [conditionFieldOptions, selectedSection?.conditionJson],
  )
  const selectedSectionConditionSummary = useMemo(
    () => describeConditionRule(selectedSectionCondition, tokenLabelByKey),
    [selectedSectionCondition, tokenLabelByKey],
  )
  const selectedSectionConditionRuleLocked = useMemo(
    () => isCoreConditionRuleLocked(selectedSection),
    [selectedSection],
  )
  const selectedSectionIsConditionalPack = useMemo(
    () => isConditionalMasterPackSection(selectedSection),
    [selectedSection],
  )
  const selectedSigningFields = useMemo(
    () => getSigningFieldsFromMetadata(selectedSection?.metadataJson || {}, selectedSection || {}),
    [selectedSection],
  )
  const selectedSigningFieldPreviewLayout = useMemo(
    () => getSigningFieldPreviewLayout(selectedSigningFields),
    [selectedSigningFields],
  )
  const selectedSectionGovernance = useMemo(
    () => getSectionGovernance(selectedSection || {}),
    [selectedSection],
  )
  const simpleVariableGroups = useMemo(() => {
    const search = normalizeText(mergeFieldSearch).toLowerCase()
    const rows = canonicalFields
      .map((field) => ({
        ...field,
        displayLabel: normalizeText(field.label) || humanizeKey(field.key),
        simpleCategory: getSimpleVariableCategory(field),
      }))
      .filter((field) => {
        if (!search) return true
        return (
          normalizeText(field.key).toLowerCase().includes(search) ||
          normalizeText(field.displayLabel).toLowerCase().includes(search) ||
          normalizeText(field.description).toLowerCase().includes(search)
        )
      })
    const orderedCategories = [
      'Buyer information',
      'Seller information',
      'Property information',
      'Transaction details',
      'Agency information',
      'Other',
    ]
    return orderedCategories
      .map((category) => ({
        category,
        rows: rows.filter((field) => field.simpleCategory === category),
      }))
      .filter((group) => group.rows.length)
  }, [canonicalFields, mergeFieldSearch])
  const resolvedFieldCount = Math.max(validationSummary.tokenCount - validationSummary.unknownTokens.length, 0)
  const unresolvedFieldCount = validationSummary.unknownTokens.length + validationSummary.missingRequired.length
  const previewReadinessIssueCount = previewState.critical.length
    + previewState.warnings.length
    + validationSummary.blockers.length
    + validationSummary.warnings.length
    + (mandatePublishGateReport?.blockingCount || 0)
    + (mandatePublishGateReport?.warningCount || 0)
  const liveTemplate = useMemo(
    () => migrationReport.defaultTemplate?.template || selectedList.find((row) => row?.is_default) || null,
    [migrationReport.defaultTemplate, selectedList],
  )
  const canPublishTemplate = hasPublishingAuthority({
    appRole: role,
    membershipRole,
    workspaceMembershipRole,
    canEdit,
  })
  const conditionalMasterAssessment = useMemo(() => {
    const metadata = form.metadataJson && typeof form.metadataJson === 'object' ? form.metadataJson : {}
    const isConditionalMaster = ['mandate', 'otp'].includes(packetType)
      && (isFocusedLegalDocumentEditor || metadata.conditional_master === true)
    return isConditionalMaster ? assessConditionalMasterTemplate(packetType, form.sections || []) : null
  }, [form.metadataJson, form.sections, isFocusedLegalDocumentEditor, packetType])
  const conditionalMasterCoverageReadiness = useMemo(() => {
    if (!conditionalMasterAssessment) return null
    return evaluateConditionalMasterCoverage({
      packetType,
      template: {
        packet_type: packetType,
        metadata_json: form.metadataJson || {},
        sections: form.sections || [],
      },
    })
  }, [conditionalMasterAssessment, form.metadataJson, form.sections, packetType])
  const publishReview = useMemo(() => {
    const baselineSections = baselineForm?.sections || []
    const currentSections = form.sections || []
    const changedSections = currentSections
      .map((section, index) => ({
        section,
        index,
        changed: sectionChanged(section, baselineSections[index]),
      }))
      .filter((item) => item.changed)
    const lockedSections = currentSections.filter((section) => getSectionGovernance(section).locked)
    const signingFieldCount = currentSections.reduce((total, section) => total + getSigningFieldsFromMetadata(section.metadataJson || {}, section).length, 0)
    const conditionCount = currentSections.filter((section) => normalizeConditionRule(section.conditionJson).enabled).length
    const metadataChanged = baselineForm ? [
      'templateLabel',
      'description',
      'versionTag',
      'renderMode',
      'templateStatus',
      'templateStoragePath',
      'templateStorageBucket',
      'templateFileName',
      'templateOutputBucket',
      'mandateTemplateVariant',
      'legalSellerClauseProfile',
      'legalBuyerClauseProfile',
      'legalPropertyClauseProfile',
      'legalFinanceClauseProfile',
    ].some((key) => stableStringify(form[key]) !== stableStringify(baselineForm[key])) : Boolean(selectedTemplate)
    const contentScanBlockers = mandatePublishGateReport?.blockingMessages || []
    const contentScanWarnings = mandatePublishGateReport?.warningMessages || []
    const conditionalMasterBlockers = conditionalMasterAssessment && !conditionalMasterAssessment.valid
      ? [
          ...(conditionalMasterAssessment.missingPackKeys.length ? [`Restore ${conditionalMasterAssessment.missingPackKeys.length} missing conditional section${conditionalMasterAssessment.missingPackKeys.length === 1 ? '' : 's'}.`] : []),
          ...(conditionalMasterAssessment.duplicateSectionKeys.length ? ['Remove duplicate conditional master section keys.'] : []),
          ...(conditionalMasterAssessment.unlockedPackKeys.length ? ['Restore the protected inclusion rules for all core conditional sections.'] : []),
          ...(conditionalMasterAssessment.signatureCount !== 1 ? ['The conditional master must contain exactly one signature section.'] : []),
        ]
      : []
    const conditionalCoverageBlockers = conditionalMasterCoverageReadiness && !conditionalMasterCoverageReadiness.ready
      ? conditionalMasterCoverageReadiness.issues.map((item) => item.message)
      : []
    const blockers = [
      ...validationSummary.blockers,
      ...contentScanBlockers,
      ...conditionalMasterBlockers,
      ...conditionalCoverageBlockers,
      ...(!selectedIsOrgOwned ? ['Save your agency version before publishing.'] : []),
      ...(!canPublishTemplate ? [`Only ${administratorLabel} can publish templates.`] : []),
      ...(hasUnsavedChanges ? ['Save the latest edits before publishing.'] : []),
      ...(normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED && !validationSummary.renderable ? ['Native structured template is not renderable yet.'] : []),
    ]

    return {
      changedSections,
      changedSectionCount: changedSections.length,
      sectionCount: currentSections.length,
      addedSectionCount: Math.max(0, currentSections.length - baselineSections.length),
      removedSectionCount: Math.max(0, baselineSections.length - currentSections.length),
      metadataChanged,
      lockedSections,
      lockedSectionCount: lockedSections.length,
      signingFieldCount,
      conditionCount,
      conditionalMasterAssessment,
      conditionalMasterCoverageReadiness,
      contentScan: mandatePublishGateReport,
      contentScanBlockers,
      contentScanWarnings,
      blockers,
      warnings: [...validationSummary.warnings, ...contentScanWarnings],
      liveTemplateLabel: liveTemplate?.template_label || liveTemplate?.template_key || 'No live template',
      currentTemplateLabel: form.templateLabel || selectedTemplate?.template_label || selectedTemplate?.template_key || 'Current draft',
    }
  }, [administratorLabel, baselineForm, canPublishTemplate, conditionalMasterAssessment, conditionalMasterCoverageReadiness, form, hasUnsavedChanges, liveTemplate, mandatePublishGateReport, selectedIsOrgOwned, selectedTemplate, validationSummary.blockers, validationSummary.renderable, validationSummary.warnings])
  const studioHealthChecks = useMemo(() => {
    const docxReady = normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.LEGACY_DOCX
      ? Boolean(normalizeText(form.templateStoragePath))
      : true
    const publishReady = validationSummary.blockers.length === 0
      && (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? validationSummary.renderable : docxReady)

    return [
      {
        label: validationSummary.blockers.length ? `${validationSummary.blockers.length} blocking issue${validationSummary.blockers.length === 1 ? '' : 's'} to resolve` : 'No blocking issues',
        passed: validationSummary.blockers.length === 0,
      },
      {
        label: validationSummary.missingRequired.length ? `${validationSummary.missingRequired.length} required variable${validationSummary.missingRequired.length === 1 ? '' : 's'} missing` : 'Required variables covered',
        passed: validationSummary.missingRequired.length === 0,
      },
      {
        label: previewState.html ? 'Test preview generated' : 'Test preview not generated yet',
        passed: Boolean(previewState.html) && !previewState.error,
      },
      {
        label: publishReady ? 'Ready to publish' : 'Save and preview before publishing',
        passed: publishReady,
      },
    ]
  }, [form.renderMode, form.templateStoragePath, previewState.error, previewState.html, validationSummary.blockers.length, validationSummary.missingRequired.length, validationSummary.renderable])
  const templateHealthPercent = useMemo(() => {
    if (!studioHealthChecks.length) return 0
    const passedCount = studioHealthChecks.filter((item) => item.passed).length
    return Math.round((passedCount / studioHealthChecks.length) * 100)
  }, [studioHealthChecks])
  const activityItems = useMemo(() => {
    if (!selectedTemplate) return []
    const items = []
    if (selectedTemplate.created_at) {
      items.push({
        key: 'created',
        title: 'Template created',
        detail: 'This version became available in the template library.',
        timestamp: selectedTemplate.created_at,
      })
    }
    if (selectedTemplate.updated_at) {
      items.push({
        key: 'updated',
        title: 'Last updated',
        detail: 'Latest saved changes to this template version.',
        timestamp: selectedTemplate.updated_at,
      })
    }
    if (selectedTemplate.is_default) {
      items.push({
        key: 'live',
        title: 'Live default',
        detail: 'New documents of this type use this version.',
        timestamp: selectedTemplate.updated_at || selectedTemplate.created_at,
      })
    }
    return items
  }, [selectedTemplate])
  const generatedDocumentRows = useMemo(() => ([
    {
      key: 'drafts',
      title: 'Draft documents',
      value: documentPackets.filter((packet) => normalizeText(packet?.status).toLowerCase() === 'draft').length,
      detail: 'Draft documents created in Document Builder.',
    },
    {
      key: 'in_progress',
      title: 'In progress',
      value: documentPackets.filter((packet) => ['ready_for_generation', 'generated', 'signing_prep', 'sent', 'partially_signed'].includes(normalizeText(packet?.status).toLowerCase())).length,
      detail: 'Documents currently being generated, checked, sent, or signed.',
    },
    {
      key: 'completed',
      title: 'Completed',
      value: documentPackets.filter((packet) => normalizeText(packet?.status).toLowerCase() === 'completed').length,
      detail: 'Completed or signed documents for this document type.',
    },
  ]), [documentPackets])
  const documentPacketRelationshipMap = useMemo(
    () => buildDocumentPacketRelationshipMap(documentPackets),
    [documentPackets],
  )
  const selectedLibraryPacket = useMemo(
    () => selectedLibraryPacketDetail || documentPackets.find((packet) => packet.id === selectedLibraryPacketId) || null,
    [documentPackets, selectedLibraryPacketDetail, selectedLibraryPacketId],
  )
  const selectedLibraryPacketSourceContext = useMemo(
    () => (selectedLibraryPacket?.source_context_json && typeof selectedLibraryPacket.source_context_json === 'object'
      ? selectedLibraryPacket.source_context_json
      : {}),
    [selectedLibraryPacket],
  )
  const selectedLibraryPacketDocumentKindLabel = useMemo(
    () => normalizeText(selectedLibraryPacketSourceContext.documentKindLabel || selectedLibraryPacketSourceContext.document_kind_label)
      || getDocumentKindOption(selectedLibraryPacketSourceContext.documentKind || selectedLibraryPacketSourceContext.document_kind).label,
    [selectedLibraryPacketSourceContext],
  )
  const selectedLibraryPacketAddendumReview = useMemo(
    () => buildAddendumDocumentReviewSummary(selectedLibraryPacketSourceContext),
    [selectedLibraryPacketSourceContext],
  )
  const selectedLibraryPacketRelationship = useMemo(
    () => documentPacketRelationshipMap.get(normalizeText(selectedLibraryPacket?.id)) || null,
    [documentPacketRelationshipMap, selectedLibraryPacket?.id],
  )
  const selectedLibraryPacketVersions = useMemo(
    () => (Array.isArray(selectedLibraryPacketDetail?.versions) ? selectedLibraryPacketDetail.versions : []),
    [selectedLibraryPacketDetail],
  )
  const selectedLibraryPacketEvents = useMemo(
    () => (Array.isArray(selectedLibraryPacketDetail?.events) ? selectedLibraryPacketDetail.events : []),
    [selectedLibraryPacketDetail],
  )
  const latestLibraryPacketVersion = selectedLibraryPacketVersions[0] || null
  const latestGeneratedLibraryPacketVersion = getLatestGeneratedPacketVersion(selectedLibraryPacketVersions)
  const latestFinalLibraryPacketVersion = useMemo(
    () => selectedLibraryPacketVersions.find((version) => normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url)) || null,
    [selectedLibraryPacketVersions],
  )
  const latestLibraryPacketArtifactUrl = getPacketVersionArtifactUrl(latestLibraryPacketVersion)
  const latestFinalLibraryPacketArtifactUrl = normalizeText(
    latestFinalLibraryPacketVersion?.final_signed_file_access_url ||
      latestFinalLibraryPacketVersion?.final_signed_file_url,
  )
  const completedLibrarySignersCount = useMemo(
    () => (selectedPacketSigningSummary?.signers || []).filter((signer) => normalizeText(signer?.status).toLowerCase() === 'signed').length,
    [selectedPacketSigningSummary?.signers],
  )
  const canGenerateFinalLibraryPacket = Boolean(
    selectedLibraryPacket?.id &&
      latestGeneratedLibraryPacketVersion?.id &&
      Number(selectedPacketSigningSummary?.signerCount || 0) > 0 &&
      (selectedPacketSigningSummary?.allSignersSigned || completedLibrarySignersCount === Number(selectedPacketSigningSummary?.signerCount || 0)) &&
      Number(selectedPacketSigningSummary?.requiredSignatures || 0) > 0 &&
      (
        selectedPacketSigningSummary?.allRequiredFieldsCompleted ||
        Number(selectedPacketSigningSummary?.completedRequiredFieldCount || 0) === Number(selectedPacketSigningSummary?.requiredFieldCount || 0)
      ),
  )
  const libraryPacketHandoverManifest = useMemo(() => {
    if (!selectedLibraryPacket?.id) return null
    const sourceContext = selectedLibraryPacket.source_context_json && typeof selectedLibraryPacket.source_context_json === 'object'
      ? selectedLibraryPacket.source_context_json
      : {}
    const signers = (selectedPacketSigningSummary?.signers || []).map((signer) => ({
      role: normalizeText(signer?.signer_role || signer?.signerRole),
      name: normalizeText(signer?.signer_name || signer?.signerName),
      email: normalizeText(signer?.signer_email || signer?.signerEmail),
      status: normalizeText(signer?.status) || 'pending',
      signedAt: normalizeText(signer?.signed_at || signer?.completed_at || signer?.updated_at),
    }))
    const events = selectedLibraryPacketEvents.slice(0, 20).map((event) => ({
      type: normalizeText(event?.event_type),
      timestamp: normalizeText(event?.created_at),
      versionId: normalizeText(event?.packet_version_id || event?.version_id),
    }))
    return {
      generatedAt: new Date().toISOString(),
      packet: {
        id: selectedLibraryPacket.id,
        title: selectedLibraryPacket.title || selectedLibraryPacket.template_label_snapshot || 'Document',
        type: selectedLibraryPacket.packet_type || packetType,
        status: normalizeText(selectedLibraryPacket.status).toLowerCase() || 'draft',
        currentVersion: selectedLibraryPacket.current_version_number || latestLibraryPacketVersion?.version_number || 0,
        template: selectedLibraryPacket.template_label_snapshot || selectedTemplate?.template_label || '',
      },
      source: {
        transactionId: normalizeText(selectedLibraryPacket.transaction_id || sourceContext.transactionId || sourceContext.transaction_id),
        leadId: normalizeText(selectedLibraryPacket.lead_id || sourceContext.leadId || sourceContext.lead_id),
        dealId: normalizeText(selectedLibraryPacket.deal_id || sourceContext.dealId || sourceContext.deal_id),
        unitId: normalizeText(selectedLibraryPacket.unit_id || sourceContext.unitId || sourceContext.unit_id),
        relatedDocument: selectedLibraryPacketAddendumReview.manifest,
        relatedAddendums: (selectedLibraryPacketRelationship?.relatedAddendums || []).map(({ packet, review }) => ({
          id: packet.id,
          title: packet.title || packet.template_label_snapshot || 'Addendum',
          status: normalizeText(packet.status).toLowerCase() || 'draft',
          addendumType: review.addendumType,
          label: review.label,
        })),
      },
      artifacts: {
        generatedDocumentUrl: latestLibraryPacketArtifactUrl,
        finalSignedDocumentUrl: latestFinalLibraryPacketArtifactUrl,
        generatedVersionId: latestGeneratedLibraryPacketVersion?.id || '',
        finalVersionId: latestFinalLibraryPacketVersion?.id || '',
      },
      signing: {
        signerCount: Number(selectedPacketSigningSummary?.signerCount || 0),
        signedCount: completedLibrarySignersCount,
        fieldCount: Number(selectedPacketSigningSummary?.fieldCount || 0),
        requiredFieldCount: Number(selectedPacketSigningSummary?.requiredFieldCount || 0),
        completedRequiredFieldCount: Number(selectedPacketSigningSummary?.completedRequiredFieldCount || 0),
        allRequiredFieldsCompleted: Boolean(selectedPacketSigningSummary?.allRequiredFieldsCompleted),
        signers,
      },
      audit: {
        eventCount: selectedLibraryPacketEvents.length,
        events,
      },
    }
  }, [
    completedLibrarySignersCount,
    latestFinalLibraryPacketArtifactUrl,
    latestFinalLibraryPacketVersion?.id,
    latestGeneratedLibraryPacketVersion?.id,
    latestLibraryPacketArtifactUrl,
    latestLibraryPacketVersion?.version_number,
    packetType,
    selectedLibraryPacket,
    selectedLibraryPacketAddendumReview.manifest,
    selectedLibraryPacketRelationship?.relatedAddendums,
    selectedLibraryPacketEvents,
    selectedPacketSigningSummary,
    selectedTemplate?.template_label,
  ])
  const libraryPacketHandoverSteps = useMemo(() => ([
    {
      key: 'generated',
      label: 'Generated document',
      detail: latestGeneratedLibraryPacketVersion ? `Version ${latestGeneratedLibraryPacketVersion.version_number}` : 'Generate the document first',
      passed: Boolean(latestGeneratedLibraryPacketVersion),
    },
    {
      key: 'signed',
      label: 'Signer completion',
      detail: `${completedLibrarySignersCount}/${selectedPacketSigningSummary?.signerCount || 0} signed`,
      passed: Number(selectedPacketSigningSummary?.signerCount || 0) > 0 &&
        (selectedPacketSigningSummary?.allSignersSigned || completedLibrarySignersCount === Number(selectedPacketSigningSummary?.signerCount || 0)),
    },
    {
      key: 'fields',
      label: 'Required fields',
      detail: `${selectedPacketSigningSummary?.completedRequiredFieldCount || 0}/${selectedPacketSigningSummary?.requiredFieldCount || 0} completed`,
      passed: Number(selectedPacketSigningSummary?.requiredFieldCount || 0) > 0 &&
        (selectedPacketSigningSummary?.allRequiredFieldsCompleted ||
          Number(selectedPacketSigningSummary?.completedRequiredFieldCount || 0) === Number(selectedPacketSigningSummary?.requiredFieldCount || 0)),
    },
    {
      key: 'final',
      label: 'Final signed copy',
      detail: latestFinalLibraryPacketVersion ? `Final v${latestFinalLibraryPacketVersion.version_number}` : 'Final copy not generated',
      passed: Boolean(latestFinalLibraryPacketArtifactUrl),
    },
  ]), [
    completedLibrarySignersCount,
    latestFinalLibraryPacketArtifactUrl,
    latestFinalLibraryPacketVersion,
    latestGeneratedLibraryPacketVersion,
    selectedPacketSigningSummary,
  ])
  const libraryPacketHandoverReady = Boolean(
    latestFinalLibraryPacketArtifactUrl &&
      libraryPacketHandoverSteps.length &&
      libraryPacketHandoverSteps.every((step) => step.passed),
  )
  useEffect(() => {
    void loadLibraryPacketSigningSummary({
      packetId: selectedLibraryPacket?.id || '',
      packetVersionId: latestGeneratedLibraryPacketVersion?.id || '',
    })
  }, [latestGeneratedLibraryPacketVersion?.id, loadLibraryPacketSigningSummary, selectedLibraryPacket?.id])
  const clauseLibraryItems = useMemo(() => CONTRACT_CLAUSE_LIBRARY_ITEMS.map((item) => ({
    ...item,
    tokens: detectTemplateTokenIssues(item.snippet).tokens,
    tokenLabels: detectTemplateTokenIssues(item.snippet).tokens.map((token) => tokenLabelByKey[token] || humanizeKey(token)),
  })), [tokenLabelByKey])
  const templateTypeConfig = visiblePacketTypes.find((item) => item.key === packetType) || visiblePacketTypes[0] || SUPPORTED_PACKET_TYPES[0]

  useEffect(() => {
    setDocumentRunForm((previous) => {
      const templateMetadata = form.metadataJson || selectedTemplate?.metadata_json || {}
      const preferredDocumentKind = getTemplatePreferredDocumentKind({
        metadata_json: templateMetadata,
      })
      const preferredAddendumType = getTemplateAddendumType({ metadata_json: templateMetadata })
      const nextDefault = createDefaultDocumentRunForm(
        packetType,
        form.templateLabel || selectedTemplate?.template_label || templateTypeConfig?.label || '',
        { documentKind: preferredDocumentKind, addendumType: preferredAddendumType },
      )
      const shouldPreserveExistingRun = previous.sourceType &&
        previous.title &&
        previous.documentKind === nextDefault.documentKind &&
        previous.addendumType === nextDefault.addendumType &&
        previous.manualDraftType === nextDefault.manualDraftType &&
        (
          previous.sourceType === nextDefault.sourceType ||
          normalizeText(previous.parentDocumentId || previous.parentDocumentReference)
        )
      if (shouldPreserveExistingRun) {
        return previous
      }
      return {
        ...nextDefault,
        title: previous.documentKind === nextDefault.documentKind ? previous.title || nextDefault.title : nextDefault.title,
        addendumDetails: previous.addendumType === nextDefault.addendumType ? previous.addendumDetails || {} : {},
        manualDraftType: nextDefault.manualDraftType,
        manualDraft: previous.documentKind === nextDefault.documentKind && previous.manualDraftType === nextDefault.manualDraftType
          ? previous.manualDraft || nextDefault.manualDraft
          : nextDefault.manualDraft,
      }
    })
  }, [form.metadataJson, form.templateLabel, packetType, selectedTemplate?.metadata_json, selectedTemplate?.template_label, templateTypeConfig?.label])

  const documentLibraryStartDocumentKind = getDocumentKindOption(documentRunForm.documentKind).key
  const documentLibraryStartHasParentDocument = Boolean(
    normalizeText(documentRunForm.parentDocumentId || documentRunForm.parentDocumentReference),
  )
  const documentLibraryStartHasExistingContext = Boolean(
    normalizeText(
      documentRunForm.transactionId ||
        documentRunForm.leadId ||
        documentRunForm.contactId ||
        documentRunForm.dealId ||
        documentRunForm.unitId ||
        documentRunForm.privateListingId ||
        documentRunForm.parentDocumentId ||
        documentRunForm.parentDocumentReference,
    ),
  )
  const documentLibraryStartSummary = useMemo(() => ([
    {
      label: 'Template',
      value: form.templateLabel || selectedTemplate?.template_label || selectedTemplate?.templateLabel || templateTypeConfig?.label || 'Selected template',
    },
    {
      label: 'Document type',
      value: getDocumentKindOption(documentRunForm.documentKind).label,
    },
    {
      label: 'Source',
      value: documentLibraryStartHasExistingContext
        ? DOCUMENT_RUN_SOURCE_OPTIONS.find((option) => option.key === documentRunForm.sourceType)?.label || 'Saved details'
        : 'Manual / standalone',
    },
    {
      label: 'Library',
      value: templateTypeConfig?.label || packetType.toUpperCase(),
    },
  ]), [
    documentLibraryStartHasExistingContext,
    documentRunForm.documentKind,
    documentRunForm.sourceType,
    form.templateLabel,
    packetType,
    selectedTemplate?.templateLabel,
    selectedTemplate?.template_label,
    templateTypeConfig?.label,
  ])

  function openDocumentLibraryStart() {
    if (!selectedTemplate) {
      setError('Choose a template before creating a document.')
      setActiveStudioArea('templates')
      return
    }
    if (hasUnsavedChanges) {
      setError('Save the selected template before creating a document from it.')
      setActiveStudioArea('templates')
      setActiveTab('template')
      return
    }
    setError('')
    setDocumentLibraryStartOpen(true)
  }

  function handleStartDocumentLibraryDocument(selection = {}) {
    const sourceMode = normalizeText(selection?.sourceMode || DOCUMENT_START_SOURCE_MODES.manual)
    const useManualDetails = sourceMode === DOCUMENT_START_SOURCE_MODES.manual
    setDocumentLibraryStartOpen(false)
    setActiveStudioArea('documents')
    setDocumentRunForm((previous) => {
      const fallbackSourceType = packetType === 'mandate' ? 'lead' : 'transaction'
      const nextManualDraftType = normalizeText(packetType).toLowerCase()
      const nextManualDraft = previous.manualDraftType === nextManualDraftType
        ? previous.manualDraft || createDefaultManualDocumentDraft(packetType)
        : createDefaultManualDocumentDraft(packetType)
      return {
        ...previous,
        documentStart: DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument,
        documentStartSourceMode: sourceMode,
        sourceType: useManualDetails
          ? 'manual'
          : previous.sourceType === 'manual'
            ? fallbackSourceType
            : previous.sourceType || fallbackSourceType,
        manualDraft: useManualDetails
          ? nextManualDraft
          : nextManualDraft,
        manualDraftType: nextManualDraftType,
        ...(useManualDetails
          ? {
              transactionId: '',
              leadId: '',
              contactId: '',
              dealId: '',
              unitId: '',
              privateListingId: '',
              linkedClientKey: '',
              linkedPropertyKey: '',
            }
          : {}),
      }
    })
    setMessage(useManualDetails
      ? 'Standalone document start is ready. Fill the simple details panel, then preview or create the document.'
      : 'Saved-details document start is ready. Confirm the linked IDs in Advanced preview data, then create the document.')
  }

  const refreshAll = useCallback(async ({
    targetPacketType = packetType,
    preferredTemplateId = selectedTemplateId,
  } = {}) => {
    await loadTemplatesAndRegistry({
      targetPacketType,
      preferredTemplateId,
    })
    await loadDocumentLibrary({ targetPacketType })
  }, [loadDocumentLibrary, loadTemplatesAndRegistry, packetType, selectedTemplateId])

  function handleStartAddendumFromLibraryPacket(packet = selectedLibraryPacket, addendumType = GENERAL_ADDENDUM_TEMPLATE_FAMILY) {
    const sourcePacket = packet || selectedLibraryPacket
    if (!sourcePacket?.id) {
      setError('Select a document before starting an addendum.')
      return
    }

    const preferredTemplate = getPreferredAddendumTemplateForType(selectedList, addendumType)
    if (!preferredTemplate?.id) {
      setActiveStudioArea('templates')
      setMessage('Create a General Addendum template first, then return to Documents to start the addendum.')
      return
    }

    const resolvedAddendumType = getTemplateAddendumType(preferredTemplate)
    const templateLabel = preferredTemplate.template_label || preferredTemplate.templateLabel || preferredTemplate.template_key || 'Addendum'
    setSelectedTemplateId(preferredTemplate.id)
    setSelectedLibraryPacketId(sourcePacket.id)
    setDocumentRunForm(buildAddendumRunFormFromPacket({
      packet: sourcePacket,
      packetType,
      templateLabel,
      addendumType: resolvedAddendumType,
    }))
    setActiveStudioArea('documents')
    setError('')
    setMessage('Addendum details are prefilled from the selected document. Add the change summary, then create the addendum.')
  }

  async function handleCreateTemplate({
    starterKind = 'standard',
    targetPacketType = packetType,
  } = {}) {
    try {
      setCreatingTemplate(true)
      setError('')
      setMessage('')

      const timestamp = Date.now()
      const resolvedPacketType = normalizeText(targetPacketType || packetType).toLowerCase() || packetType
      const resolvedTemplateTypeConfig = visiblePacketTypes.find((item) => item.key === resolvedPacketType)
        || SUPPORTED_PACKET_TYPES.find((item) => item.key === resolvedPacketType)
        || templateTypeConfig
      const addendumStarterConfig = getAddendumTemplateStarter(starterKind)
      const isGeneralAddendumStarter = Boolean(addendumStarterConfig || starterKind === GENERAL_ADDENDUM_TEMPLATE_FAMILY)
      const resolvedAddendumStarter = addendumStarterConfig || getAddendumTemplateStarter(GENERAL_ADDENDUM_TEMPLATE_FAMILY)
      const renderMode = getDefaultRenderMode(resolvedPacketType)
      const documentKindOption = getDocumentKindOption(isGeneralAddendumStarter ? 'addendum' : 'standard')
      const starterSections = isGeneralAddendumStarter
        ? createGeneralAddendumStarterSections(resolvedPacketType, resolvedAddendumStarter.key)
        : createStarterSections(resolvedPacketType)
      const created = await createDocumentPacketTemplate({
        packetType: resolvedPacketType,
        moduleType: normalizedModuleType,
        templateKey: isGeneralAddendumStarter
          ? `${resolvedPacketType}_${resolvedAddendumStarter.templateKeySegment}_${timestamp}`
          : `${resolvedPacketType}_template_${timestamp}`,
        templateLabel: isGeneralAddendumStarter
          ? `${resolvedTemplateTypeConfig.shortLabel} ${resolvedAddendumStarter.templateLabel}`
          : `${resolvedTemplateTypeConfig.label}`,
        description: isGeneralAddendumStarter
          ? resolvedAddendumStarter.description
          : `Standard ${resolvedTemplateTypeConfig.label} template with the usual legal sections.`,
        versionTag: 'v1',
        templateStatus: 'draft',
        templateFormat: getTemplateFormatForMode(renderMode),
        isDefault: false,
        isActive: false,
        metadataJson: {
          lifecycle_status: 'draft',
          render_mode: renderMode,
          native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
          starter_template: isGeneralAddendumStarter ? resolvedAddendumStarter.key : 'blank',
          template_family: isGeneralAddendumStarter ? GENERAL_ADDENDUM_TEMPLATE_FAMILY : null,
          addendum_type: isGeneralAddendumStarter ? resolvedAddendumStarter.key : null,
          addendum_label: isGeneralAddendumStarter ? resolvedAddendumStarter.label : null,
          document_kind: documentKindOption.key,
          documentKind: documentKindOption.key,
          preferred_document_kind: documentKindOption.key,
          document_kind_label: documentKindOption.label,
          ...(resolvedPacketType === 'mandate' && !isGeneralAddendumStarter
            ? {
                mandate_template_variant: 'default',
                mandateTemplateVariant: 'default',
                mandate_template_variants: ['default'],
              }
            : {}),
        },
        sections: starterSections.map((section, index) => mapSectionForSave(section, index, resolvedPacketType)),
      })

      await refreshAll({
        targetPacketType: resolvedPacketType,
        preferredTemplateId: created?.id || '',
      })
      setPacketType(resolvedPacketType)
      setActiveDocumentTypeKey(resolvedPacketType)
      setSelectedTemplateId(created?.id || '')
      setMessage(isGeneralAddendumStarter ? `${resolvedAddendumStarter.label} template created.` : `${resolvedTemplateTypeConfig.label} template created.`)
      return created
    } catch (createError) {
      setError(createError?.message || 'Unable to create template.')
      return null
    } finally {
      setCreatingTemplate(false)
    }
  }

  async function handleCreateBlankTemplate(event) {
    event?.preventDefault?.()
    const label = normalizeText(blankTemplateForm.templateLabel)
    const resolvedPacketType = normalizeText(blankTemplateForm.packetType || packetType).toLowerCase() || packetType
    const documentKindOption = getDocumentKindOption(blankTemplateForm.documentKind || 'custom')
    if (!label) {
      setError('Name the blank template before creating it.')
      return null
    }

    try {
      setCreatingTemplate(true)
      setError('')
      setMessage('')

      const timestamp = Date.now()
      const renderMode = getDefaultRenderMode(resolvedPacketType)
      const keySegment = createTemplateKeySegment(label)
      const created = await createDocumentPacketTemplate({
        packetType: resolvedPacketType,
        moduleType: normalizedModuleType,
        templateKey: `${resolvedPacketType}_${documentKindOption.key}_${keySegment}_${timestamp}`,
        templateLabel: label,
        description: normalizeText(blankTemplateForm.description) || `Blank ${documentKindOption.label.toLowerCase()} canvas.`,
        versionTag: 'v1',
        templateStatus: 'draft',
        templateFormat: getTemplateFormatForMode(renderMode),
        isDefault: false,
        isActive: false,
        metadataJson: {
          lifecycle_status: 'draft',
          render_mode: renderMode,
          native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
          starter_template: BLANK_CANVAS_TEMPLATE_STARTER,
          template_family: CUSTOM_TEMPLATE_FAMILY,
          document_kind: documentKindOption.key,
          documentKind: documentKindOption.key,
          preferred_document_kind: documentKindOption.key,
          document_kind_label: documentKindOption.label,
          blank_canvas: true,
          ...(resolvedPacketType === 'mandate'
            ? {
                mandate_template_variant: 'default',
                mandateTemplateVariant: 'default',
                mandate_template_variants: ['default'],
              }
            : {}),
        },
        sections: createBlankCanvasSections().map((section, index) => mapSectionForSave(section, index, resolvedPacketType)),
      })

      await refreshAll({
        targetPacketType: resolvedPacketType,
        preferredTemplateId: created?.id || '',
      })
      setPacketType(resolvedPacketType)
      setActiveDocumentTypeKey(`template:${created?.id || ''}`)
      setSelectedTemplateId(created?.id || '')
      setSelectedSectionIndex(0)
      setSelectedCanvasBlockIndex(0)
      setTemplateStarterMenuOpen(false)
      setBlankTemplateForm(createBlankTemplateForm(resolvedPacketType))
      setMessage(`${label} blank template created.`)
      return created
    } catch (createError) {
      setError(createError?.message || 'Unable to create blank template.')
      return null
    } finally {
      setCreatingTemplate(false)
    }
  }

  async function handleCreateGeneralAddendumTemplate(options = {}) {
    return handleCreateTemplate({ ...options, starterKind: GENERAL_ADDENDUM_TEMPLATE_FAMILY })
  }

  async function handleCreateAddendumStarterTemplate(starterKind = GENERAL_ADDENDUM_TEMPLATE_FAMILY, options = {}) {
    if (starterKind === GENERAL_ADDENDUM_TEMPLATE_FAMILY) return handleCreateGeneralAddendumTemplate(options)
    return handleCreateTemplate({ ...options, starterKind })
  }

  async function createMandateVariantTemplate(routeKey = '') {
    const mandateRoute = normalizeMandateTemplateRoute(routeKey)
    if (packetType !== 'mandate' || mandateRoute === 'default') return null

    const existing = selectedList.find((template) => (
      Boolean(template?.organisation_id) &&
      getMandateTemplateRouteFromTemplate(template) === mandateRoute
    ))
    if (existing?.id) return existing

    const sourceTemplate = templateDetail || selectedTemplate || createDefaultLegalTemplateRecord('mandate', {
      moduleType: normalizedModuleType,
      virtual: true,
    })
    const sourceForm = (form.sections || []).length ? form : toTemplateForm(sourceTemplate)
    const sourceMetadata = sourceTemplate?.metadata_json && typeof sourceTemplate.metadata_json === 'object'
      ? sourceTemplate.metadata_json
      : {}
    const sourceTemplateId = normalizeText(sourceTemplate.id || selectedTemplate?.id || selectedTemplateId)
    const routeLabel = getMandateTemplateRouteLabel(mandateRoute)
    const renderMode = normalizeText(sourceForm.renderMode || normalizeTemplateRenderMode(sourceTemplate, 'mandate') || getDefaultRenderMode('mandate'))
      || getDefaultRenderMode('mandate')
    const draftForm = {
      ...sourceForm,
      packetType: 'mandate',
      renderMode,
      mandateTemplateVariant: mandateRoute,
      templateStatus: 'draft',
      isDefault: false,
      isActive: false,
    }
    const metadataJson = buildTemplateMetadata(
      { ...draftForm, validationSummary },
      {
        ...sourceMetadata,
        source_template_id: sourceTemplateId || null,
        base_template_id: sourceTemplateId || null,
        source_template_label: normalizeText(sourceTemplate.template_label || selectedTemplate?.template_label || sourceForm.templateLabel || ''),
        mandate_variant_created_from: sourceTemplateId || null,
        mandate_variant_route: mandateRoute,
        mandate_variant_label: routeLabel,
        agency_version_created_via: 'mandate_variant_scaffold',
      },
      null,
    )
    const templateKeyBase = normalizeText(sourceTemplate.template_key || selectedTemplate?.template_key || 'mandate_default_v1') || 'mandate_default_v1'
    const created = await createDocumentPacketTemplate({
      packetType: 'mandate',
      moduleType: normalizedModuleType,
      templateKey: `${templateKeyBase}_${mandateRoute}_${Date.now()}`,
      templateLabel: getMandateVariantTemplateLabel(sourceForm.templateLabel || sourceTemplate.template_label || 'Mandate Agreement', mandateRoute),
      description: `Scenario-specific mandate template for ${routeLabel}.`,
      versionTag: normalizeText(sourceForm.versionTag || sourceTemplate.version_tag || 'v1') || 'v1',
      templateStatus: 'draft',
      templateFormat: getTemplateFormatForMode(renderMode),
      templateStorageBucket: normalizeText(sourceForm.templateStorageBucket || sourceTemplate.template_storage_bucket || ''),
      templateStoragePath: normalizeText(sourceForm.templateStoragePath || sourceTemplate.template_storage_path || ''),
      templateFileName: normalizeText(sourceForm.templateFileName || sourceTemplate.template_file_name || ''),
      isDefault: false,
      isActive: false,
      metadataJson,
      sections: (sourceForm.sections || []).map((section, index) => mapSectionForSave(section, index, 'mandate')),
    })

    return created
  }

  async function handleCreateMandateVariantTemplate(routeKey = '') {
    try {
      setCreatingMandateVariants(true)
      setError('')
      setMessage('')
      const created = await createMandateVariantTemplate(routeKey)
      await refreshAll({
        targetPacketType: 'mandate',
        preferredTemplateId: created?.id || '',
      })
      if (created?.id) setSelectedTemplateId(created.id)
      setPacketType('mandate')
      setActiveDocumentTypeKey('mandate')
      setMessage(created?.id ? `${getMandateTemplateRouteLabel(routeKey)} variant created.` : 'Mandate variant already exists.')
      return created
    } catch (createError) {
      setError(createError?.message || 'Unable to create mandate variant.')
      return null
    } finally {
      setCreatingMandateVariants(false)
    }
  }

  async function handleCreateMissingMandateVariantTemplates() {
    if (!missingMandateVariantOptions.length) {
      setMessage('All mandate variants already exist.')
      return []
    }

    try {
      setCreatingMandateVariants(true)
      setError('')
      setMessage('')
      const created = []
      for (const option of missingMandateVariantOptions) {
        const template = await createMandateVariantTemplate(option.key)
        if (template?.id && !created.some((row) => row.id === template.id)) created.push(template)
      }
      await refreshAll({
        targetPacketType: 'mandate',
        preferredTemplateId: created[0]?.id || selectedTemplateId,
      })
      if (created[0]?.id) setSelectedTemplateId(created[0].id)
      setPacketType('mandate')
      setActiveDocumentTypeKey('mandate')
      setMessage(`${created.length} mandate variant${created.length === 1 ? '' : 's'} created as draft templates.`)
      return created
    } catch (createError) {
      setError(createError?.message || 'Unable to create mandate variants.')
      return []
    } finally {
      setCreatingMandateVariants(false)
    }
  }

  const handleCreateEditableCopy = useCallback(async ({
    quiet = false,
    source = 'manual',
    successMessage = '',
  } = {}) => {
    if (!templateDetail || !selectedTemplate) return null

    const sourceTemplateId = normalizeText(templateDetail.id || selectedTemplate.id || selectedTemplateId)
    const existingAgencyVersion = selectedList.find((template) => {
      const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
      return Boolean(template?.organisation_id) &&
        template.id !== selectedTemplateId &&
        (
          normalizeText(metadata.source_template_id) === sourceTemplateId ||
          normalizeText(metadata.base_template_id) === sourceTemplateId
        )
    })

    if (source === 'auto' && existingAgencyVersion) {
      setSelectedTemplateId(existingAgencyVersion.id)
      setHasUnsavedChanges(false)
      setMessage(successMessage || 'Editing your agency version of this template.')
      return existingAgencyVersion
    }

    try {
      setCloning(true)
      setError('')
      setMessage('')
      const sourceLabel = normalizeText(templateDetail.template_label || selectedTemplate.template_label || templateTypeConfig.label) || templateTypeConfig.label
      const isExplicitDuplicate = source !== 'auto'
      const cloned = await cloneDocumentPacketTemplate({
        sourceTemplateId,
        templateLabel: isExplicitDuplicate ? `${sourceLabel} Copy` : sourceLabel,
        description: templateDetail.description || '',
        variantLabel: isExplicitDuplicate ? 'copy' : 'company',
      })

      await refreshAll()
      setSelectedTemplateId(cloned?.id || '')
      setHasUnsavedChanges(false)
      setMessage(successMessage || (quiet ? 'Editing your agency version of this template.' : 'Company template copy created and ready to edit.'))
      return cloned
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create editable copy.')
      return null
    } finally {
      setCloning(false)
    }
  }, [
    refreshAll,
    selectedList,
    selectedTemplate,
    selectedTemplateId,
    templateDetail,
    templateTypeConfig.label,
  ])

  useEffect(() => {
    if (!canEdit || loading || saving || cloning) return
    if (!selectedTemplateId || !selectedTemplate || selectedIsOrgOwned) return
    if (!templateDetail || templateDetail.id !== selectedTemplateId) return
    if (autoDraftSourceTemplateRef.current === selectedTemplateId) return

    autoDraftSourceTemplateRef.current = selectedTemplateId
    void handleCreateEditableCopy({ quiet: true, source: 'auto' }).then((created) => {
      if (!created) autoDraftSourceTemplateRef.current = ''
    })
  }, [
    canEdit,
    cloning,
    handleCreateEditableCopy,
    loading,
    saving,
    selectedIsOrgOwned,
    selectedTemplate,
    selectedTemplateId,
    templateDetail,
  ])

  function addSection() {
    const nextIndex = (form.sections || []).length
    setHasUnsavedChanges(true)
    setForm((previous) => ({
      ...previous,
      sections: [
        ...(previous.sections || []),
        {
          id: null,
          sectionKey: `section_${(previous.sections || []).length + 1}`,
          sectionLabel: `Section ${(previous.sections || []).length + 1}`,
          sectionType: 'legal_text',
          legalText: '',
          placeholderKeysText: '',
          isRequired: true,
          conditionJson: {},
          custom: true,
          metadataJson: { custom: true },
          requiresInitial: false,
          initialPlaceholderKey: '',
          signingFields: [],
          sortOrder: (previous.sections || []).length,
        },
      ],
    }))
    setSelectedSectionIndex(nextIndex)
    setPendingSectionTitleFocus(true)
  }

  function updateSection(index, patch) {
    setHasUnsavedChanges(true)
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).map((section, sectionIndex) => {
        if (sectionIndex !== index) return section
        const safePatch = isConditionalMasterPackSection(section)
          ? Object.fromEntries(Object.entries(patch).filter(([key]) => !CONDITIONAL_PACK_PROTECTED_SECTION_FIELDS.has(key)))
          : isCoreConditionRuleLocked(section) && Object.prototype.hasOwnProperty.call(patch, 'conditionJson')
            ? Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'conditionJson'))
            : patch
        return { ...section, ...safePatch }
      }),
    }))
  }

  function moveSection(index, direction) {
    const targetIndex = index + direction
    const sectionCount = (form.sections || []).length
    if (index < 0 || targetIndex < 0 || index >= sectionCount || targetIndex >= sectionCount) return
    if (isConditionalMasterPackSection(form.sections?.[index]) || isConditionalMasterPackSection(form.sections?.[targetIndex])) return

    setHasUnsavedChanges(true)
    setForm((previous) => {
      const sections = [...(previous.sections || [])]
      const [moved] = sections.splice(index, 1)
      sections.splice(targetIndex, 0, moved)
      return {
        ...previous,
        sections: sections.map((section, sortOrder) => ({ ...section, sortOrder })),
      }
    })
    setSelectedSectionIndex(targetIndex)
  }

  function removeSection(index) {
    if (isConditionalMasterPackSection(form.sections?.[index])) return
    setHasUnsavedChanges(true)
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).filter((_, sectionIndex) => sectionIndex !== index),
    }))
    setSelectedSectionIndex((previous) => {
      if (previous > index) return previous - 1
      if (previous === index) return Math.max(0, index - 1)
      return previous
    })
  }

  async function handleUploadTemplateFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedTemplateId || !selectedTemplate) return
    if (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
      setError('Native structured templates do not require a DOCX upload. Switch this template to Legacy DOCX mode if you need to attach a base file.')
      return
    }

    try {
      setUploadingTemplate(true)
      setError('')
      setMessage('')

      const uploaded = await uploadDocumentPacketTemplateAsset({
        file,
        packetType,
        moduleType: normalizedModuleType,
        templateKey: normalizeText(selectedTemplate.template_key || selectedTemplateId),
        versionTag: normalizeText(form.versionTag || selectedTemplate.version_tag || 'v1') || 'v1',
      })

      setForm((previous) => ({
        ...previous,
        templateStoragePath: normalizeText(uploaded.path),
        templateStorageBucket: normalizeText(uploaded.bucket),
        templateFileName: normalizeText(uploaded.fileName),
      }))
      setHasUnsavedChanges(true)
      setMessage('DOCX template uploaded. Save to apply this file to the template version.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload DOCX template.')
    } finally {
      setUploadingTemplate(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!selectedTemplateId || !selectedTemplate) return

    if (!selectedIsOrgOwned) {
      await handleSaveDraftAction(event)
      return
    }

    if (validationSummary.blockers.length) {
      setError('Resolve template blockers before saving.')
      return
    }

    const isActivatingNativeTemplate =
      normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED &&
      (Boolean(form.isActive) || Boolean(form.isDefault) || ['approved', 'active'].includes(normalizeText(form.templateStatus).toLowerCase()))
    if (isActivatingNativeTemplate && !validationSummary.renderable) {
      setError('This native template is not renderable yet. Cover the required fields before activating it.')
      return
    }
    const isActivatingMandateTemplate = packetType === 'mandate' && (
      Boolean(form.isDefault) ||
      isLiveTemplateStatus(form.templateStatus)
    )
    if (isActivatingMandateTemplate && mandatePublishGateReport?.isValidForPublish === false) {
      setError('Mandate content scanner found blockers. Resolve the route wording before activating this mandate template.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const metadataJson = buildTemplateMetadata({ ...form, packetType, validationSummary, mandateContentScan: mandatePublishGateReport }, form.metadataJson || {}, null)
      const saveUpdates = {
        templateLabel: form.templateLabel,
        description: form.description,
        versionTag: form.versionTag,
        templateStatus: 'draft',
        templateFormat: getTemplateFormatForMode(form.renderMode),
        templateStorageBucket: form.templateStorageBucket,
        templateStoragePath: form.templateStoragePath,
        templateFileName: form.templateFileName,
        isActive: false,
        isDefault: false,
        metadataJson,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index, packetType)),
      }

      const selectedStatus = normalizeTemplateStatus(selectedTemplate)
      const savedTemplate = isLiveTemplateStatus(selectedStatus) || selectedStatus === 'archived' || Boolean(selectedTemplate.is_default)
        ? await createDocumentPacketTemplateRevision({ sourceTemplateId: selectedTemplateId, ...saveUpdates })
        : await updateDocumentPacketTemplate(selectedTemplateId, saveUpdates)

      await refreshAll({ preferredTemplateId: savedTemplate?.id || selectedTemplateId })
      if (savedTemplate?.id) setSelectedTemplateId(savedTemplate.id)
      setHasUnsavedChanges(false)
      setMessage(savedTemplate?.id !== selectedTemplateId
        ? `Draft ${savedTemplate.version_tag || 'revision'} created. The live version remains unchanged.`
        : 'Legal template draft saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save legal template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetAsDefault() {
    if (!selectedTemplateId || !selectedIsOrgOwned || !canEdit) return
    if (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED && !validationSummary.renderable) {
      setError('This native template is not renderable yet. Cover the required fields before making it the default.')
      return
    }
    if (packetType === 'mandate' && mandatePublishGateReport?.isValidForPublish === false) {
      setError('Mandate content scanner found blockers. Resolve the route wording before publishing this mandate template.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const metadataJson = buildTemplateMetadata({ ...form, packetType, validationSummary, mandateContentScan: mandatePublishGateReport }, form.metadataJson || {}, null)
      const publishedTemplate = await publishDocumentPacketTemplateRevision(selectedTemplateId, {
        templateLabel: form.templateLabel,
        description: form.description,
        templateFormat: getTemplateFormatForMode(form.renderMode),
        templateStorageBucket: form.templateStorageBucket,
        templateStoragePath: form.templateStoragePath,
        templateFileName: form.templateFileName,
        metadataJson,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index, packetType)),
        makeDefault: true,
      })

      await refreshAll({ preferredTemplateId: publishedTemplate?.id || selectedTemplateId })
      if (publishedTemplate?.id) setSelectedTemplateId(publishedTemplate.id)
      setHasUnsavedChanges(false)
      setMessage(`Published ${publishedTemplate?.version_tag || 'template'} as the default. Existing transaction documents retain their original version.`)
    } catch (defaultError) {
      setError(defaultError?.message || 'Unable to set template as default.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestGenerate() {
    if (!templateDetail && !selectedTemplate) return

    try {
      setTestingTemplate(true)
      setError('')
      setMessage('')
      setPreviewState({ loading: true, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
      const previewTemplate = buildPreviewTemplateFromForm({
        selectedTemplate,
        templateDetail,
        form,
        packetType,
        moduleType: normalizedModuleType,
        validationSummary,
      })
      const legalScenarioPreview = ['mandate', 'otp'].includes(packetType)
        ? resolveLegalDocumentPreviewScenario({
            scenarioKey: templatePreviewScenarioKey,
            packetType,
            organisationId: resolvedOrganisationId,
            template: previewTemplate,
          })
        : null

      const preview = await renderPacketPreview({
        packetType,
        context: legalScenarioPreview?.context || buildSamplePreviewContext(packetType),
        template: previewTemplate,
        title: legalScenarioPreview
          ? `${templateTypeConfig.shortLabel} · ${legalScenarioPreview.scenario.label} preview`
          : `${templateTypeConfig.shortLabel} template validation preview`,
        validationAction: 'template_preview',
      })

      setPreviewState({
        loading: false,
        html: preview?.previewHtml || '',
        warnings: preview?.warnings || [],
        critical: preview?.critical || [],
        dataRequirements: preview?.dataRequirements || [],
        scenarioProfile: preview?.legalDocumentScenarioProfile || legalScenarioPreview?.profile || null,
        conditionalMasterAudit: preview?.conditionalEngineAudit || legalScenarioPreview?.conditionalMasterAudit || null,
        signingAudit: preview?.conditionalSigningAudit || legalScenarioPreview?.signingAudit || null,
        error: '',
      })

      if (preview?.critical?.length) {
        setMessage('Template preview generated with template blockers. Review the checklist before activation.')
      } else {
        setMessage('Preview generated from the current edits using safe example details.')
      }
    } catch (previewError) {
      setPreviewState({
        loading: false,
        html: '',
        warnings: [],
        critical: [],
        dataRequirements: [],
        error: previewError?.message || 'Unable to generate template preview.',
      })
    } finally {
      setTestingTemplate(false)
    }
  }

  async function handleTestGenerateFromRun() {
    if (!templateDetail && !selectedTemplate) return

    try {
      setTestingTemplate(true)
      setError('')
      setMessage('')
      setPreviewState({ loading: true, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
      const runPayload = buildDocumentRunPayload({
        runForm: documentRunForm,
        packetType,
        selectedTemplate,
        templateDetail,
        form,
        moduleType: normalizedModuleType,
        validationSummary,
        templateTypeConfig,
      })

      const preview = await renderPacketPreview({
        packetType,
        context: runPayload.context,
        template: runPayload.previewTemplate,
        title: runPayload.title,
      })

      setPreviewState({
        loading: false,
        html: preview?.previewHtml || '',
        warnings: preview?.warnings || [],
        critical: preview?.critical || [],
        dataRequirements: [],
        error: '',
        sourceLabel: 'real_run',
      })

      if (preview?.critical?.length) {
        setMessage('Preview generated with validation blockers. Open the issue cards and fix the missing linked details.')
      } else {
        setMessage('Preview generated from the linked details.')
      }
    } catch (previewError) {
      setPreviewState({
        loading: false,
        html: '',
        warnings: [],
        critical: [],
        dataRequirements: [],
        error: previewError?.message || 'Unable to generate real-context preview.',
      })
    } finally {
      setTestingTemplate(false)
    }
  }

  async function handleCreateDocumentPacketFromRun({ autoGenerate = false } = {}) {
    if (!selectedTemplateId || !selectedTemplate) return
    if (hasUnsavedChanges) {
      setError('Save the template before creating a draft document from it.')
      setActiveStudioArea('templates')
      setActiveTab('template')
      return
    }
    const addendumReadiness = getAddendumGenerationReadinessForRun(documentRunForm)
    if (autoGenerate && !addendumReadiness.ready) {
      setError('Complete the addendum readiness checklist before generating. You can still save it as a draft from Advanced preview data.')
      setActiveStudioArea('documents')
      return null
    }

    try {
      setCreatingDocumentPacket(true)
      setError('')
      setMessage('')
      const runPayload = buildDocumentRunPayload({
        runForm: documentRunForm,
        packetType,
        selectedTemplate,
        templateDetail,
        form,
        moduleType: normalizedModuleType,
        validationSummary,
        templateTypeConfig,
      })
      const packetInput = {
        packetType,
        templateId: selectedTemplateId,
        templateKeySnapshot: selectedTemplate.template_key || selectedTemplate.templateKey || '',
        templateLabelSnapshot: form.templateLabel || selectedTemplate.template_label || selectedTemplate.templateLabel || '',
        title: runPayload.title,
        status: 'draft',
        transactionId: runPayload.references.transactionId || null,
        leadId: runPayload.references.leadId || null,
        contactId: runPayload.references.contactId || null,
        dealId: runPayload.references.dealId || null,
        unitId: runPayload.references.unitId || null,
        sourceContextJson: {
          ...runPayload.sourceContext,
          contractStudioPreviewContext: runPayload.context,
          templateId: selectedTemplateId,
          templateLabel: form.templateLabel || selectedTemplate.template_label || selectedTemplate.templateLabel || '',
          templateVersion: form.versionTag || selectedTemplate.version_tag || selectedTemplate.versionTag || '',
          documentKind: runPayload.documentKind,
          documentKindLabel: runPayload.documentKindLabel,
        },
      }
      const selectedTemplateStatus = normalizeTemplateStatus(selectedTemplate)
      const packet = isLiveTemplateStatus(selectedTemplateStatus) && selectedTemplate.is_active !== false
        ? await createEditableDocumentDraftFromTemplate({
            ...packetInput,
            placeholders: runPayload.context?.placeholders || runPayload.context?.mandateData?.placeholders || {},
          })
        : await createDocumentPacket(packetInput)
      if (autoGenerate && packet?.id) {
        await generatePacketVersion({
          packetId: packet.id,
          packetType,
          context: runPayload.context,
          template: runPayload.previewTemplate,
          allowWarnings: true,
        })
      }
      await loadDocumentLibrary({ targetPacketType: packetType })
      if (packet?.id) {
        setSelectedLibraryPacketId(packet.id)
        await loadLibraryPacketDetail(packet.id)
      }
      setActiveStudioArea('documents')
      setMessage(autoGenerate ? `Document created and generated: ${packet?.title || runPayload.title}` : `Draft document saved: ${packet?.title || runPayload.title}`)
      return packet
    } catch (packetError) {
      setError(autoGenerate
        ? formatLegalDocumentGenerationRecovery(packetError, { packetType })
        : packetError?.message || 'Unable to create draft document.')
      return null
    } finally {
      setCreatingDocumentPacket(false)
    }
  }

  async function resolveTemplateForLibraryPacket(packet = {}) {
    const packetTemplateId = normalizeText(packet?.template_id)
    if (!packetTemplateId) return null
    if (packetTemplateId === selectedTemplateId && templateDetail) return templateDetail
    return fetchDocumentPacketTemplate(packetTemplateId, { includeSections: true }).catch((templateError) => {
      console.warn('[Document Builder] Unable to load packet template for library action.', templateError)
      return null
    })
  }

  async function handlePreviewLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    try {
      setPacketActionId(`preview:${packet.id}`)
      setError('')
      setMessage('')
      setPreviewState({ loading: true, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
      const context = buildDocumentRunContextFromPacket(packet)
      const template = await resolveTemplateForLibraryPacket(packet)
      const preview = await renderPacketPreview({
        packetType: packet.packet_type || packetType,
        context,
        template,
        title: packet.title || packet.template_label_snapshot || 'Document preview',
      })
      setPreviewState({
        loading: false,
        html: preview?.previewHtml || '',
        warnings: preview?.warnings || [],
        critical: preview?.critical || [],
        dataRequirements: [],
        error: '',
        sourceLabel: 'library_packet',
      })
      setActiveStudioArea('templates')
      setActiveTab('preview')
      setMessage(preview?.critical?.length ? 'Document preview generated with validation blockers.' : 'Document preview generated from its saved linked details.')
    } catch (previewError) {
      setPreviewState({
        loading: false,
        html: '',
        warnings: [],
        critical: [],
        dataRequirements: [],
        error: previewError?.message || 'Unable to preview document.',
      })
      setError(previewError?.message || 'Unable to preview document.')
    } finally {
      setPacketActionId('')
    }
  }

  async function handleGenerateLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    const addendumReadiness = getAddendumGenerationReadinessForPacket(packet)
    if (!addendumReadiness.ready) {
      setError('Complete the addendum readiness checklist before generating this document.')
      setSelectedLibraryPacketId(packet.id)
      setActiveStudioArea('documents')
      return
    }
    const generationBaseline = captureLegalDocumentGenerationBaseline(selectedLibraryPacketVersions)
    try {
      setPacketActionId(`generate:${packet.id}`)
      setError('')
      setMessage('')
      const context = buildDocumentRunContextFromPacket(packet)
      const template = await resolveTemplateForLibraryPacket(packet)
      const result = await generatePacketVersion({
        packetId: packet.id,
        packetType: packet.packet_type || packetType,
        context,
        template,
        allowWarnings: true,
      })
      await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
      await loadLibraryPacketDetail(packet.id)
      setMessage(`Generated document version v${result?.version?.version_number || result?.packet?.current_version_number || ''}.`)
      documentGenerationFailureCountsRef.current.clear()
    } catch (generateError) {
      setMessage('Checking whether the document completed…')
      const reconciliation = await reconcileLegalDocumentGenerationFailure({
        error: generateError,
        baseline: generationBaseline,
        loadStatus: async () => {
          const detail = await fetchDocumentPacket(packet.id, { includeVersions: true, includeEvents: true })
          setSelectedLibraryPacketDetail(detail || null)
          return detail || null
        },
      })
      if (reconciliation.confirmed) {
        setError('')
        setMessage(`Generation completed and recovered version v${reconciliation.version?.version_number || ''} is ready to review.`)
        documentGenerationFailureCountsRef.current.clear()
        await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
        return
      }
      setMessage('')
      const recoveryPacketType = packet.packet_type || packetType
      const recovery = resolveLegalDocumentGenerationRecovery(generateError, { packetType: recoveryPacketType })
      const signature = `${recoveryPacketType}:${packet.id}:${recovery.code}`
      const policy = resolveLegalDocumentRetryPolicy({ recovery, previousFailureCount: documentGenerationFailureCountsRef.current.get(signature) || 0, packetType: recoveryPacketType, packetId: packet.id })
      documentGenerationFailureCountsRef.current.set(signature, policy.failureCount)
      setError(`${policy.message} Next step: ${policy.nextAction}`)
      if (policy.escalated && !recordedDocumentGenerationHandoffsRef.current.has(policy.supportReference)) {
        void recordLegalDocumentGenerationSupportHandoff({
          appendEvent: appendDocumentPacketEvent,
          packetId: packet.id,
          organisationId: packet.organisation_id || null,
          policy,
          packetType: recoveryPacketType,
          surface: 'document_builder',
        }).then((result) => {
          if (result.recorded) recordedDocumentGenerationHandoffsRef.current.add(policy.supportReference)
        })
      }
    } finally {
      setPacketActionId('')
    }
  }

  async function handleArchiveLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    const confirmed = window.confirm(`Archive "${packet.title || packet.template_label_snapshot || 'this document'}"?`)
    if (!confirmed) return
    try {
      setPacketActionId(`archive:${packet.id}`)
      setError('')
      setMessage('')
      await archiveDocumentPacket(packet.id, {
        reason: 'Archived from Document Builder.',
      })
      await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
      await loadLibraryPacketDetail(packet.id)
      setMessage('Document archived.')
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive document.')
    } finally {
      setPacketActionId('')
    }
  }

  async function handlePrepareSigningForLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    const targetVersion = latestGeneratedLibraryPacketVersion
    if (!targetVersion?.id) {
      setError('Generate the document before preparing signing fields.')
      return
    }
    try {
      setPacketActionId(`signing-prep:${packet.id}`)
      setError('')
      setMessage('')
      const context = buildDocumentRunContextFromPacket(packet)
      const placeholders = targetVersion.placeholders_resolved_json && typeof targetVersion.placeholders_resolved_json === 'object'
        ? targetVersion.placeholders_resolved_json
        : {}
      const result = await prepareSigningFields({
        packetId: packet.id,
        packetType: packet.packet_type || packetType,
        context,
        placeholders,
      })
      setSelectedPacketSigningSummary(result?.summary || null)
      await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
      await loadLibraryPacketDetail(packet.id)
      await loadLibraryPacketSigningSummary({
        packetId: packet.id,
        packetVersionId: targetVersion.id,
      })
      setMessage(result?.alreadyPrepared ? 'Signing prep was already complete.' : 'Signing fields and signers prepared.')
    } catch (signingError) {
      setError(signingError?.message || 'Unable to prepare signing fields.')
    } finally {
      setPacketActionId('')
    }
  }

  async function handleGenerateSigningLinksForLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    const targetVersion = latestGeneratedLibraryPacketVersion
    if (!targetVersion?.id) {
      setError('Generate the document before creating signing links.')
      return
    }
    try {
      setPacketActionId(`signing-links:${packet.id}`)
      setError('')
      setMessage('')
      const result = await generateSigningLinks({
        packetId: packet.id,
        packetVersionId: targetVersion.id,
        expiresInHours: 72,
        baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
        regenerate: false,
      })
      setSigningLinksResult(result || null)
      await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
      await loadLibraryPacketDetail(packet.id)
      await loadLibraryPacketSigningSummary({
        packetId: packet.id,
        packetVersionId: targetVersion.id,
      })
      setMessage(`Generated secure signing link${(result?.signers || []).filter((signer) => normalizeText(signer?.signing_link)).length === 1 ? '' : 's'}.`)
    } catch (signingError) {
      setError(signingError?.message || 'Unable to generate signing links.')
    } finally {
      setPacketActionId('')
    }
  }

  async function handleGenerateFinalSignedForLibraryPacket(packet = selectedLibraryPacket) {
    if (!packet?.id) return
    const targetVersion = latestGeneratedLibraryPacketVersion
    if (!targetVersion?.id) {
      setError('Generate the document before finalising the signed document.')
      return
    }
    try {
      setPacketActionId(`finalise:${packet.id}`)
      setError('')
      setMessage('')
      const result = await generateFinalSignedPacketDocument({
        packetId: packet.id,
        packetVersionId: targetVersion.id,
      })
      await loadDocumentLibrary({ targetPacketType: packet.packet_type || packetType })
      await loadLibraryPacketDetail(packet.id)
      await loadLibraryPacketSigningSummary({
        packetId: packet.id,
        packetVersionId: targetVersion.id,
      })
      setMessage(result?.packet ? 'Final signed document generated and archived.' : 'Final signed document generated.')
    } catch (finaliseError) {
      setError(finaliseError?.message || 'Unable to generate final signed document.')
    } finally {
      setPacketActionId('')
    }
  }

  function handleDownloadLibraryPacketHandoverManifest() {
    if (!libraryPacketHandoverManifest || !selectedLibraryPacket?.id) return
    try {
      const safeTitle = normalizeText(selectedLibraryPacket.title || selectedLibraryPacket.template_label_snapshot || 'document-packet')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'document-packet'
      const blob = new Blob([JSON.stringify(libraryPacketHandoverManifest, null, 2)], {
        type: 'application/json;charset=utf-8',
      })
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${safeTitle}-handover-manifest.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      setMessage('Handover manifest downloaded.')
    } catch (manifestError) {
      setError(manifestError?.message || 'Unable to download handover manifest.')
    }
  }

  async function handleSaveDraftAction(event) {
    event?.preventDefault?.()
    if (!selectedTemplateId || !selectedTemplate || !canEdit) return

    if (selectedIsOrgOwned) {
      await handleSave({ preventDefault() {} })
      return
    }

    if (validationSummary.blockers.length) {
      setError('Resolve the document issues before saving a draft.')
      return
    }

    try {
      setSaving(true)
      await handleCreateEditableCopy({
        quiet: true,
        source: 'save',
        successMessage: 'Agency template saved.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveSelectedTemplate() {
    if (!selectedTemplateId || !selectedIsOrgOwned || !canEdit || form.isDefault) return
    const confirmed = window.confirm(`Archive "${form.templateLabel || selectedTemplate?.template_label || 'this template'}"? Existing transaction documents will remain available.`)
    if (!confirmed) return
    try {
      setSaving(true)
      setError('')
      await archiveDocumentPacketTemplate(selectedTemplateId)
      await refreshAll()
      setMessage('Template archived. Existing documents and their template revision were not changed.')
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePlaceholder(event) {
    event.preventDefault()

    const placeholderKey = normalizeText(placeholderForm.placeholderKey)
    if (!placeholderKey) {
      setError('Merge field key is required.')
      return
    }
    if (!PLACEHOLDER_KEY_PATTERN.test(placeholderKey)) {
      setError('Merge field key can only include letters, numbers, dots, underscores, and hyphens.')
      return
    }

    try {
      setSavingPlaceholder(placeholderKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType,
        placeholderKey,
        entityScope: normalizeText(placeholderForm.entityScope || 'transaction'),
        dataType: normalizeText(placeholderForm.dataType || 'text'),
        description: normalizeNullableText(placeholderForm.description),
        exampleValue: normalizeNullableText(placeholderForm.exampleValue),
        isRequiredDefault: Boolean(placeholderForm.isRequiredDefault),
        isActive: placeholderForm.isActive !== false,
      })

      await refreshAll()
      setPlaceholderForm({
        placeholderKey: '',
        entityScope: 'transaction',
        dataType: 'text',
        description: '',
        exampleValue: '',
        isRequiredDefault: false,
        isActive: true,
      })
      setMessage('Merge field definition saved.')
    } catch (placeholderError) {
      setError(placeholderError?.message || 'Unable to save merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function togglePlaceholderFlag(row, field, nextValue) {
    try {
      const rowKey = normalizeText(row?.placeholder_key)
      if (!rowKey) return
      setSavingPlaceholder(rowKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType: row.packet_type || packetType,
        placeholderKey: row.placeholder_key,
        entityScope: row.entity_scope || 'transaction',
        dataType: row.data_type || 'text',
        description: row.description || '',
        exampleValue: row.example_value || '',
        isRequiredDefault: field === 'isRequiredDefault' ? nextValue : Boolean(row.is_required_default),
        isActive: field === 'isActive' ? nextValue : Boolean(row.is_active),
      })

      await refreshAll()
      setMessage('Merge field updated.')
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function handleCopyToken(token = '') {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`{{${normalizedToken}}}`)
      }
      setMessage(`Copied {{${normalizedToken}}} to clipboard.`)
    } catch {
      setMessage(`Token ready: {{${normalizedToken}}}`)
    }
  }

  function insertTextIntoSelectedSection(rawText = '', { block = false } = {}) {
    const insertion = String(rawText || '')
    if (!insertion || !selectedSection || !canEdit) return

    const textarea = clauseTextareaRef.current
    const currentValue = String(selectedSection.legalText || '')
    let nextValue = insertion
    let cursorPosition = insertion.length

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const beforeText = currentValue.slice(0, start)
      const afterText = currentValue.slice(end)
      const prefix = block && beforeText && !/\n\s*$/.test(beforeText) ? '\n\n' : ''
      const suffix = block && afterText && !/^\s*\n/.test(afterText) ? '\n\n' : ''
      nextValue = `${beforeText}${prefix}${insertion}${suffix}${afterText}`
      cursorPosition = start + prefix.length + insertion.length
    } else {
      const prefix = block
        ? currentValue && !/\n\s*$/.test(currentValue) ? '\n\n' : ''
        : currentValue && !/\s$/.test(currentValue) ? ' ' : ''
      nextValue = `${currentValue}${prefix}${insertion}`
      cursorPosition = nextValue.length
    }

    const tokenScan = detectTemplateTokenIssues(nextValue)
    const nextPlaceholderKeys = Array.from(new Set([
      ...(selectedSection.placeholderKeys || []),
      ...tokenScan.tokens.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
    ]))
    updateSection(selectedSectionIndex, {
      legalText: nextValue,
      placeholderKeysText: nextPlaceholderKeys.join(', '),
      placeholderKeys: nextPlaceholderKeys,
    })

    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(cursorPosition, cursorPosition)
      }
    })
  }

  function updateSelectedCanvasBlock(blockIndex, nextRawValue) {
    if (!selectedSection || !canEdit) return
    const blocks = selectedSectionCanvasBlocks.length
      ? selectedSectionCanvasBlocks
      : [{ type: 'paragraph', raw: selectedSectionText, text: selectedSectionText }]
    const nextBlocks = blocks.map((block, index) => (
      index === blockIndex
        ? {
            ...block,
            raw: String(nextRawValue || ''),
            text: String(nextRawValue || ''),
          }
        : block
    ))
    const nextValue = serializeTemplateEditorDocumentBlocks(nextBlocks)
    const tokenScan = detectTemplateTokenIssues(nextValue)
    const nextPlaceholderKeys = Array.from(new Set([
      ...(selectedSection.placeholderKeys || []),
      ...tokenScan.tokens.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
    ]))
    updateSection(selectedSectionIndex, {
      legalText: nextValue,
      placeholderKeysText: nextPlaceholderKeys.join(', '),
      placeholderKeys: nextPlaceholderKeys,
    })
  }

  function handleInsertDocumentBlock(blockType = 'paragraph') {
    if (blockType === 'table') {
      handleInsertTable()
      return
    }
    const snippet = DOCUMENT_BLOCK_SNIPPETS[blockType] || DOCUMENT_BLOCK_SNIPPETS.paragraph
    insertTextIntoSelectedSection(snippet, { block: true })
  }

  function updateSelectedSectionCondition(patch = {}) {
    if (!selectedSection || !canEdit || selectedSectionConditionRuleLocked) return
    const nextCondition = normalizeConditionRule({
      ...selectedSectionCondition,
      ...patch,
    })
    const nextPlaceholderKeys = Array.from(new Set([
      ...(selectedSection.placeholderKeys || []),
      ...String(selectedSection.placeholderKeysText || '')
        .split(',')
        .map((item) => normalizeTemplateTokenKey(item))
        .filter(Boolean),
      nextCondition.enabled ? nextCondition.field : '',
    ].filter(Boolean)))
    const conditionJson = buildVisibilityConditionJson({
      ...nextCondition,
      label: nextCondition.label || describeConditionRule(nextCondition, tokenLabelByKey),
    })
    updateSection(selectedSectionIndex, {
      conditionJson,
      placeholderKeysText: nextPlaceholderKeys.join(', '),
      placeholderKeys: nextPlaceholderKeys,
    })
  }

  function clearSelectedSectionCondition() {
    if (!selectedSection || !canEdit || selectedSectionConditionRuleLocked) return
    updateSection(selectedSectionIndex, { conditionJson: {} })
  }

  function setSelectedSectionSigningFields(nextFields = []) {
    if (!selectedSection || !canEdit) return
    const normalizedFields = resolveSigningFieldPlanCollisions(nextFields)
    const metadataJson = selectedSection.metadataJson && typeof selectedSection.metadataJson === 'object' ? selectedSection.metadataJson : {}
    const signingMetadata = metadataJson.signing && typeof metadataJson.signing === 'object' ? metadataJson.signing : {}
    updateSection(selectedSectionIndex, {
      signingFields: normalizedFields,
      metadataJson: {
        ...metadataJson,
        signing: {
          ...signingMetadata,
          planned_fields: normalizedFields,
          signing_fields: normalizedFields,
        },
        planned_signing_fields: normalizedFields,
      },
    })
  }

  function addSelectedSectionSigningField(fieldType = 'signature', signerRole = 'purchaser_1') {
    if (!selectedSection || !canEdit) return
    const typeConfig = getSigningFieldTypeConfig(fieldType)
    const normalizedFieldType = normalizeSigningFieldType(fieldType)
    const preset = normalizedFieldType === 'initial'
      ? SIGNING_FIELD_POSITION_PRESETS.find((item) => item.key === 'initial_right') || SIGNING_FIELD_POSITION_PRESETS[0]
      : SIGNING_FIELD_POSITION_PRESETS[Math.min(selectedSigningFields.length, 2)] || SIGNING_FIELD_POSITION_PRESETS[0]
    const yOffset = normalizedFieldType === 'date' ? -36 : 0
    const nextField = normalizeSigningFieldPlan({
      id: `planned_field_${Date.now()}_${selectedSigningFields.length + 1}`,
      signerRole,
      fieldType,
      pageNumber: 1,
      xPosition: preset.x,
      yPosition: Math.max(24, preset.y + yOffset),
      width: typeConfig.width,
      height: typeConfig.height,
      required: true,
    }, selectedSigningFields.length)
    setSelectedSectionSigningFields([...selectedSigningFields, nextField])
  }

  function updateSelectedSectionSigningField(fieldId = '', patch = {}) {
    if (!selectedSection || !canEdit) return
    setSelectedSectionSigningFields(selectedSigningFields.map((field, index) => {
      if (field.id !== fieldId) return field
      const patched = { ...field, ...patch }
      if (patch.fieldType) {
        const typeConfig = getSigningFieldTypeConfig(patch.fieldType)
        patched.width = typeConfig.width
        patched.height = typeConfig.height
      }
      return normalizeSigningFieldPlan(patched, index)
    }))
  }

  function removeSelectedSectionSigningField(fieldId = '') {
    if (!selectedSection || !canEdit) return
    setSelectedSectionSigningFields(selectedSigningFields.filter((field) => field.id !== fieldId))
  }

  function updateSectionGovernance(index = selectedSectionIndex, patch = {}) {
    const section = (form.sections || [])[index]
    if (!section || !canEdit || !canPublishTemplate) return
    const metadataJson = section.metadataJson && typeof section.metadataJson === 'object' ? section.metadataJson : {}
    const currentGovernance = metadataJson.governance && typeof metadataJson.governance === 'object' ? metadataJson.governance : {}
    const nextGovernance = {
      ...currentGovernance,
      ...patch,
    }
    if (patch.locked === true && !nextGovernance.locked_at) {
      nextGovernance.locked_at = new Date().toISOString()
    }
    if (patch.locked === false) {
      nextGovernance.locked_at = null
      nextGovernance.locked_by_role = null
      nextGovernance.lockReason = ''
    }
    updateSection(index, {
      metadataJson: {
        ...metadataJson,
        governance: nextGovernance,
      },
    })
  }

  function updateSelectedSectionGovernance(patch = {}) {
    updateSectionGovernance(selectedSectionIndex, patch)
  }

  function handleInsertClauseFromLibrary(clause = {}) {
    if (!selectedSection || !canEdit) {
      setActiveStudioArea('templates')
      setActiveTab('template')
      setError('Choose an editable template section before inserting a clause.')
      return
    }
    setError('')
    setActiveStudioArea('templates')
    setActiveTab('template')
    const currentValue = String(selectedSection.legalText || '')
    const snippet = String(clause.snippet || '')
    const nextValue = `${currentValue}${currentValue && !/\n\s*$/.test(currentValue) ? '\n\n' : ''}${snippet}`
    const tokenScan = detectTemplateTokenIssues(nextValue)
    const normalizedCondition = normalizeConditionRule(clause.defaultCondition || {})
    const nextPlaceholderKeys = Array.from(new Set([
      ...(selectedSection.placeholderKeys || []),
      ...String(selectedSection.placeholderKeysText || '')
        .split(',')
        .map((item) => normalizeTemplateTokenKey(item))
        .filter(Boolean),
      ...tokenScan.tokens.map((item) => normalizeTemplateTokenKey(item)).filter(Boolean),
      normalizedCondition.enabled ? normalizedCondition.field : '',
    ].filter(Boolean)))
    const nextConditionJson = buildVisibilityConditionJson({
      ...normalizedCondition,
      label: normalizedCondition.label || describeConditionRule(normalizedCondition, tokenLabelByKey),
    })
    updateSection(selectedSectionIndex, {
      legalText: nextValue,
      conditionJson: nextConditionJson || selectedSection.conditionJson || {},
      placeholderKeysText: nextPlaceholderKeys.join(', '),
      placeholderKeys: nextPlaceholderKeys,
    })
    setMessage(`Inserted clause: ${clause.title}`)
  }

  function focusSourceEditor() {
    setShowSourceEditor(true)
    requestAnimationFrame(() => {
      clauseTextareaRef.current?.focus?.()
    })
  }

  function handleInsertVariableToken(token = '') {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    insertTextIntoSelectedSection(`{{${normalizedToken}}}`)
  }

  function handleInsertTable() {
    insertTextIntoSelectedSection(LEGAL_TEMPLATE_TABLE_SNIPPET, { block: true })
  }

  function openTemplatePreview({ generate = true } = {}) {
    if (!selectedTemplate) return
    setActiveStudioArea('templates')
    setActiveTab('preview')
    if (generate && !testingTemplate) {
      requestAnimationFrame(() => void handleTestGenerate())
    }
  }

  async function openPublishDialog() {
    if (!selectedTemplateId || !canEdit || saving || form.isDefault) return
    if (!selectedIsOrgOwned) {
      const created = await handleCreateEditableCopy({
        quiet: true,
        source: 'publish',
        successMessage: 'Agency template ready to publish.',
      })
      if (!created) return
    }
    setPublishReviewAccepted(false)
    setShowPublishConfirm(true)
  }

  async function confirmPublishTemplate() {
    if (packetType === 'mandate' && mandatePublishGateReport?.isValidForPublish === false) {
      setError('Mandate content scanner found blockers. Resolve the route wording before publishing this mandate template.')
      setShowPublishConfirm(false)
      return
    }
    if (publishReview.blockers.length) {
      setError('Resolve the blockers before publishing this template.')
      setShowPublishConfirm(false)
      return
    }
    if (!publishReviewAccepted) {
      setError('Review and confirm the summary before publishing this template.')
      return
    }
    setShowPublishConfirm(false)
    await handleSetAsDefault()
  }

  if (loading) {
    return <SettingsLoadingState label="Loading Document Builder…" />
  }

  return (
    <div
      className="space-y-6 [&[data-legal-document-editor-scope=standard]_[data-editor-tool=situation]]:hidden [&[data-legal-document-editor-scope=standard]_[data-editor-tool=signing]]:hidden [&[data-legal-document-editor-scope=situations]_[data-editor-tool=signing]]:hidden [&[data-legal-document-editor-scope=signing]_[data-editor-tool=content]]:hidden [&[data-legal-document-editor-scope=signing]_[data-editor-tool=situation]]:hidden"
      data-simple-document-builder={simpleDocumentBuilderEnabled ? 'enabled' : 'off'}
      data-legal-document-editor-scope={normalizedEditorScope}
    >
      <StartDocumentModal
        open={documentLibraryStartOpen}
        onClose={() => setDocumentLibraryStartOpen(false)}
        entryPoint={DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument}
        packetType={packetType}
        documentKind={documentLibraryStartDocumentKind === 'custom' ? DOCUMENT_START_DOCUMENT_KINDS.standard : documentLibraryStartDocumentKind}
        initialSourceMode={documentLibraryStartHasExistingContext ? DOCUMENT_START_SOURCE_MODES.saved : DOCUMENT_START_SOURCE_MODES.manual}
        hasExistingContext={documentLibraryStartHasExistingContext}
        hasClientContact
        hasParentDocument={documentLibraryStartDocumentKind === 'standard' || documentLibraryStartDocumentKind === 'custom' || documentLibraryStartHasParentDocument}
        contextSummary={documentLibraryStartSummary}
        title="Create Document"
        subtitle="Choose whether this starts from saved records or as a standalone manual document. You can still review before sending."
        busy={creatingDocumentPacket}
        onContinue={handleStartDocumentLibraryDocument}
      />
      <header className="space-y-5 rounded-[20px] border border-[#dbe7f3] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="min-w-0 space-y-2">
          <h1 className="text-[1.9rem] font-semibold leading-tight text-[#102033] sm:text-[2.1rem]">{title}</h1>
          <p className="max-w-3xl text-[15px] leading-7 text-[#52667d]">{visibleDescription}</p>
        </div>

        {!canEdit ? (
          <SettingsBanner tone="warning">
            Read-only for your role. {administratorLabel} can edit templates, clauses, live versions, and field rules.
          </SettingsBanner>
        ) : null}

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        <div className="grid gap-3">
          <div className={isFocusedLegalDocumentEditor ? 'hidden' : 'overflow-x-auto rounded-[16px] border border-[#dbe7f3] bg-[#f8fbff] p-1'}>
            <div className="flex min-w-max gap-1">
              {simpleDocumentTabs.map((item) => {
                const Icon = item.icon
                const active = activeStudioArea === 'templates' && packetType === item.packetType && !selectedIsPickerCustomTemplate
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectPrimaryTemplateTab(item)}
                    className={[
                      'inline-flex min-h-11 items-center gap-2 rounded-[12px] border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdeccf]',
                      active
                        ? 'border-[#96d7ad] bg-white text-[#128642] shadow-[inset_0_-2px_0_#128642]'
                        : 'border-transparent bg-transparent text-[#52667d] hover:border-[#dbe7f3] hover:bg-white hover:text-[#102033]',
                    ].join(' ')}
                  >
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
              {customTemplateTabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={selectedTemplateId === item.template.id}
                  onClick={() => {
                    setActiveStudioArea('templates')
                    setPacketType(item.packetType)
                    setSelectedTemplateId(item.template.id)
                    setActiveDocumentTypeKey(item.key)
                    setActiveTab('template')
                    setTemplateStarterMenuOpen(false)
                  }}
                  className={[
                    'inline-flex min-h-11 items-center gap-2 rounded-[12px] border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdeccf]',
                    selectedTemplateId === item.template.id
                      ? 'border-[#96d7ad] bg-white text-[#128642] shadow-[inset_0_-2px_0_#128642]'
                      : 'border-transparent bg-transparent text-[#52667d] hover:border-[#dbe7f3] hover:bg-white hover:text-[#102033]',
                  ].join(' ')}
                  title={item.documentKindLabel}
                >
                  <FileText size={15} />
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setActiveStudioArea('templates')
                  setActiveTab('template')
                  setBlankTemplateForm((previous) => ({
                    ...previous,
                    packetType,
                  }))
                  setTemplateStarterMenuOpen((previous) => !previous)
                }}
                aria-expanded={templateStarterMenuOpen}
                disabled={!canEdit || saving || cloning || creatingTemplate}
                className={[
                  'inline-flex min-h-11 items-center gap-2 rounded-[12px] border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#bdeccf] disabled:cursor-not-allowed disabled:opacity-60',
                  templateStarterMenuOpen
                    ? 'border-[#96d7ad] bg-white text-[#128642] shadow-[inset_0_-2px_0_#128642]'
                    : 'border-transparent bg-transparent text-[#52667d] hover:border-[#dbe7f3] hover:bg-white hover:text-[#102033]',
                ].join(' ')}
              >
                <Plus size={15} />
                <span>Blank Template</span>
              </button>
            </div>
          </div>

          {templateStarterMenuOpen ? (
            <form
              className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-3"
              aria-label="Blank template creator"
              onSubmit={(event) => void handleCreateBlankTemplate(event)}
            >
              <div className="grid gap-4 rounded-[14px] bg-white p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                <div className="rounded-[14px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-4 text-center">
                  <div className="mx-auto h-32 w-24 rounded-[8px] border-2 border-[#d1dbe8] bg-white shadow-[0_12px_22px_rgba(15,23,42,0.08)]" />
                  <p className="mt-3 text-sm font-semibold text-[#102033]">Blank canvas</p>
                  <p className="mt-1 text-xs leading-5 text-[#607387]">No clauses or preset sections.</p>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-[#102033]">Create a blank template</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#607387]">
                        Name it, choose what kind of document it is, then build the wording from an empty page.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="self-start rounded-[10px] border border-[#dbe7f3] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#52667d] transition hover:border-[#bfd5f5] hover:bg-white"
                      onClick={() => setTemplateStarterMenuOpen(false)}
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className={settingsFieldClass}>
                      Template name
                      <input
                        type="text"
                        value={blankTemplateForm.templateLabel}
                        disabled={!canEdit || saving || cloning || creatingTemplate}
                        onChange={(event) => setBlankTemplateForm((previous) => ({ ...previous, templateLabel: event.target.value }))}
                        placeholder="e.g. Occupation Addendum"
                      />
                    </label>

                    <label className={settingsFieldClass}>
                      Based on
                      <select
                        value={blankTemplateForm.packetType}
                        disabled={!canEdit || saving || cloning || creatingTemplate}
                        onChange={(event) => setBlankTemplateForm((previous) => ({ ...previous, packetType: event.target.value }))}
                      >
                        {visiblePacketTypes.map((item) => (
                          <option key={`blank-packet-${item.key}`} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className={settingsFieldClass}>
                      Template type
                      <select
                        value={blankTemplateForm.documentKind}
                        disabled={!canEdit || saving || cloning || creatingTemplate}
                        onChange={(event) => setBlankTemplateForm((previous) => ({ ...previous, documentKind: event.target.value }))}
                      >
                        {BLANK_TEMPLATE_DOCUMENT_KIND_KEYS.map((key) => {
                          const option = getDocumentKindOption(key)
                          return <option key={`blank-kind-${option.key}`} value={option.key}>{option.label}</option>
                        })}
                      </select>
                    </label>

                    <label className={settingsFieldClass}>
                      Note
                      <input
                        type="text"
                        value={blankTemplateForm.description}
                        disabled={!canEdit || saving || cloning || creatingTemplate}
                        onChange={(event) => setBlankTemplateForm((previous) => ({ ...previous, description: event.target.value }))}
                        placeholder="Optional team note"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className={studioSecondaryButtonClass}
                      onClick={() => setTemplateStarterMenuOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={studioPrimaryButtonClass}
                      disabled={!canEdit || saving || cloning || creatingTemplate || !normalizeText(blankTemplateForm.templateLabel)}
                    >
                      <Plus size={14} />
                      <span>{creatingTemplate ? 'Creating...' : 'Create Blank Template'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : null}

          {activeStudioArea === 'templates' ? (
            <div className="flex min-w-0 flex-col gap-3 pt-1 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap gap-2" aria-label="Template view">
                <button
                  type="button"
                  aria-pressed={activeTab !== 'preview'}
                  onClick={() => {
                    setActiveStudioArea('templates')
                    setActiveTab('template')
                  }}
                  className={[
                    'inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold transition',
                    activeTab !== 'preview'
                      ? 'border-[#96d7ad] bg-[#eef9f1] text-[#128642]'
                      : 'border-[#dbe7f3] bg-white text-[#42566d] hover:border-[#b9dfc8] hover:bg-[#f8fbff]',
                  ].join(' ')}
                >
                  <FileText size={15} />
                  <span>Edit Template</span>
                </button>
                <button
                  type="button"
                  aria-pressed={activeTab === 'preview'}
                  onClick={() => openTemplatePreview()}
                  disabled={!selectedTemplate}
                  className={[
                    'inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                    activeTab === 'preview'
                      ? 'border-[#96d7ad] bg-[#eef9f1] text-[#128642]'
                      : 'border-[#dbe7f3] bg-white text-[#42566d] hover:border-[#b9dfc8] hover:bg-[#f8fbff]',
                  ].join(' ')}
                >
                  <Eye size={15} />
                  <span>Preview</span>
                </button>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                <span className="min-h-10 rounded-[12px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm font-semibold text-[#607387]">
                  {selectedIsOrgOwned ? 'Editing your agency version' : cloning ? 'Preparing agency version...' : 'Agency version opens automatically'}
                </span>
                <button
                  type="button"
                  className={studioSecondaryButtonClass}
                  onClick={() => void handleCreateEditableCopy({ source: 'duplicate' })}
                  disabled={!selectedTemplate || !canEdit || saving || cloning || hasUnsavedChanges}
                  title={hasUnsavedChanges ? 'Save changes before duplicating this template.' : 'Create another independent company template variant.'}
                >
                  <CopyPlus size={14} />
                  <span>{cloning ? 'Copying...' : 'Duplicate'}</span>
                </button>
                <button
                  type="button"
                  className={studioSecondaryButtonClass}
                  onClick={() => void handleArchiveSelectedTemplate()}
                  disabled={!selectedTemplate || !selectedIsOrgOwned || !canEdit || saving || cloning || Boolean(form.isDefault)}
                  title={form.isDefault ? 'Publish another default before archiving this template.' : 'Archive this template without removing existing documents.'}
                >
                  <Trash2 size={14} />
                  <span>Archive</span>
                </button>
                <button
                  type="button"
                  className={studioSecondaryButtonClass}
                  onClick={(event) => void handleSaveDraftAction(event)}
                  disabled={!selectedTemplate || !canEdit || saving || cloning}
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  className={studioPrimaryButtonClass}
                  onClick={() => void openPublishDialog()}
                  disabled={!selectedTemplate || !canEdit || saving || cloning || Boolean(form.isDefault)}
                >
                  <ShieldCheck size={14} />
                  <span>{form.isDefault ? 'Live' : 'Publish'}</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {activeStudioArea === 'templates' && activeTab === 'template' ? (
        selectedTemplate ? (
          <>
            <form
              onSubmit={handleSaveDraftAction}
              className={[
                'grid min-w-0 gap-4 lg:gap-5 xl:min-h-[760px] xl:items-start',
                outlineCollapsed
                  ? editorToolsCollapsed
                    ? 'xl:grid-cols-[64px_minmax(0,1fr)_64px]'
                    : 'xl:grid-cols-[64px_minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[64px_minmax(0,1fr)_minmax(280px,320px)]'
                  : editorToolsCollapsed
                    ? 'xl:grid-cols-[220px_minmax(0,1fr)_64px] 2xl:grid-cols-[260px_minmax(0,1fr)_64px]'
                    : 'xl:grid-cols-[220px_minmax(0,1fr)_minmax(260px,300px)] 2xl:grid-cols-[260px_minmax(0,1fr)_minmax(280px,320px)]',
              ].join(' ')}
            >
              <aside className={[
                'rounded-[20px] border border-[#dbe7f3] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.05)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-140px)] xl:overflow-hidden',
                outlineCollapsed ? 'p-3' : 'p-4',
              ].join(' ')}
              >
                <div className={`mb-4 flex items-start gap-3 ${outlineCollapsed ? 'flex-col items-center' : 'justify-between'}`}>
                  <div className={outlineCollapsed ? 'sr-only' : ''}>
                    <h2 className="text-base font-semibold text-[#102033]">Document Outline</h2>
                    <p className="mt-1 text-sm leading-6 text-[#607387]">Click a section to edit that part of the document.</p>
                  </div>
                  <button
                    type="button"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#dbe7f3] bg-white text-[#52667d] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642]"
                    onClick={() => setOutlineCollapsed((previous) => !previous)}
                    aria-label={outlineCollapsed ? 'Expand document outline' : 'Collapse document outline'}
                    title={outlineCollapsed ? 'Expand outline' : 'Collapse outline'}
                  >
                    <ChevronDown size={16} className={outlineCollapsed ? '-rotate-90' : 'rotate-90'} />
                  </button>
                </div>

                {scopedSectionEntries.length ? (
                  <div className="space-y-2 xl:max-h-[calc(100vh-300px)] xl:overflow-y-auto xl:pr-1">
                    {scopedSectionEntries.map(({ section, index }) => {
                      const active = selectedSectionIndex === index
                      const label = getFriendlySectionLabel(section, index)
                      return (
                        <div
                          key={`${section.sectionKey}-${index}`}
                          className={[
                            'group flex w-full items-center gap-2 rounded-[10px] border px-2 py-2 text-sm transition',
                            active
                              ? 'border-[#96d7ad] bg-[#eef9f1] text-[#0f7438] shadow-[0_8px_18px_rgba(18,134,66,0.08)]'
                              : 'border-[#e4ebf2] bg-white text-[#42566d] hover:border-[#cbdceb] hover:bg-[#f8fbff]',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedSectionIndex(index)}
                            className={`flex min-w-0 flex-1 items-center gap-3 rounded-[8px] px-1 py-0.5 text-left ${outlineCollapsed ? 'justify-center' : ''}`}
                            title={label}
                          >
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#dbe7f3] bg-white text-xs font-semibold">
                              {index + 1}
                            </span>
                            <span className={outlineCollapsed ? 'sr-only' : 'min-w-0 truncate font-semibold'}>{label}</span>
                          </button>
                          {canEdit && !outlineCollapsed && !isConditionalMasterPackSection(section) ? (
                            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  moveSection(index, -1)
                                }}
                                disabled={index === 0}
                                className="grid h-8 w-8 place-items-center rounded-[8px] border border-transparent text-[#607387] transition hover:border-[#dbe7f3] hover:bg-[#f8fbff] hover:text-[#128642] disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${label} up`}
                                title={`Move ${label} up`}
                              >
                                <ChevronDown size={14} className="rotate-180" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  moveSection(index, 1)
                                }}
                                disabled={index === (form.sections || []).length - 1}
                                className="grid h-8 w-8 place-items-center rounded-[8px] border border-transparent text-[#607387] transition hover:border-[#dbe7f3] hover:bg-[#f8fbff] hover:text-[#128642] disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label={`Move ${label} down`}
                                title={`Move ${label} down`}
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  removeSection(index)
                                }}
                                className="grid h-8 w-8 place-items-center rounded-[8px] border border-transparent text-[#9c5a50] transition hover:border-[#f1d2cb] hover:bg-[#fff6f4] hover:text-[#ba3f2d] focus:outline-none focus:ring-2 focus:ring-[#f1d2cb]"
                                aria-label={`Remove ${label}`}
                                title={`Remove ${label}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <SettingsEmptyState
                    title={normalizedEditorScope === 'situations'
                      ? editorSituation ? `${editorSituation.label} section is missing` : 'Choose a conditional section above'
                      : 'No sections yet'}
                    description={normalizedEditorScope === 'situations'
                      ? editorSituation
                        ? 'This master is incomplete. Restore the missing core section before publishing.'
                        : 'Select one of the seller, purchaser, consent, property or finance sections before editing.'
                      : 'Add a section to start editing this document.'}
                  />
                )}

                {normalizedEditorScope === 'all' || normalizedEditorScope === 'standard' ? (
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#dbe7f3] bg-white px-3 py-2.5 text-sm font-semibold text-[#128642] shadow-[0_10px_18px_rgba(15,23,42,0.04)] transition hover:bg-[#f6fbf8] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={addSection}
                    disabled={!canEdit}
                    title="Add Section"
                  >
                    <Plus size={15} />
                    <span className={outlineCollapsed ? 'sr-only' : ''}>Add Section</span>
                  </button>
                ) : null}
              </aside>

              <main className="min-w-0 overflow-hidden rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:p-5">
                {selectedSection ? (
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607387]">
                            Section {selectedSectionIndex + 1}
                          </span>
                          <input
                            ref={sectionTitleInputRef}
                            aria-label="Section title"
                            type="text"
                            value={selectedSection.sectionLabel}
                            disabled={!canEdit || selectedSectionIsConditionalPack}
                            onChange={(event) => updateSection(selectedSectionIndex, { sectionLabel: event.target.value })}
                            className="min-h-11 min-w-0 flex-1 rounded-[12px] border border-[#dbe7f3] bg-white px-3 text-base font-semibold text-[#102033] outline-none transition placeholder:text-[#9aabba] focus:border-[#96d7ad] focus:ring-4 focus:ring-[#e7f6ed] disabled:bg-[#f8fbff] disabled:text-[#7b8da6]"
                            placeholder={`Section ${selectedSectionIndex + 1}`}
                          />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#607387]">{selectedSectionDescription}</p>
                      </div>
                      {selectedSectionIsConditionalPack ? (
                        <span className="inline-flex min-h-10 items-center gap-2 rounded-[11px] border border-[#cdebd8] bg-[#eef9f1] px-3 text-sm font-semibold text-[#167449]">
                          <ShieldCheck size={14} />
                          Core conditional section
                        </span>
                      ) : <details className="relative">
                        <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer`}>
                          <Type size={14} />
                          <span>Section Settings</span>
                          <ChevronDown size={14} />
                        </summary>
                        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-[18px] border border-[#dbe7f3] bg-white p-4 shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
                          <label className={settingsFieldClass}>
                            Section name
                            <input
                              type="text"
                              value={selectedSection.sectionLabel}
                              disabled={!canEdit}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionLabel: event.target.value })}
                            />
                          </label>
                          <label className={`${settingsFieldClass} mt-3`}>
                            Auto-filled information used here
                            <input
                              type="text"
                              value={selectedSection.placeholderKeysText || ''}
                              disabled={!canEdit}
                              onChange={(event) => updateSection(selectedSectionIndex, { placeholderKeysText: event.target.value })}
                              placeholder="buyer_full_name, purchase_price"
                            />
                          </label>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              className={studioDangerButtonClass}
                              onClick={() => removeSection(selectedSectionIndex)}
                              disabled={!canEdit}
                            >
                              <Trash2 size={14} />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </details>}
                    </div>

                    {selectedSectionIsConditionalPack ? (
                      <section className="rounded-[18px] border border-[#cdebd8] bg-[#f4fbf7] px-5 py-4" aria-label="Conditional section editing boundary">
                        <div className="flex items-start gap-3">
                          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#167449]" aria-hidden="true" />
                          <div>
                            <h2 className="text-sm font-semibold text-[#18372a]">Edit the legal wording, not the inclusion logic</h2>
                            <p className="mt-1 text-sm leading-6 text-[#5f786b]">Bridge includes this section automatically when {editorSituation?.activationLabel || selectedSectionConditionSummary.toLowerCase()}. Its key, position, merge fields and activation rule are protected.</p>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {selectedSectionUnknownTokens.length ? (
                      <SettingsBanner tone="warning">
                        Some variables in this section are not recognised yet: {selectedSectionUnknownTokens.map((item) => `{{${item.token}}}`).join(', ')}.
                      </SettingsBanner>
                    ) : null}

                    {normalizedEditorScope === 'signing' ? (
                      <section className="rounded-[18px] border border-[#eadfc5] bg-[#fffaf0] px-5 py-5">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#e5d5ad] bg-white text-[#8a630f]">
                            <FileSignature size={18} />
                          </span>
                          <div>
                            <h2 className="text-base font-semibold text-[#493b1d]">Signing setup for this section</h2>
                            <p className="mt-1 text-sm leading-6 text-[#756541]">Use the Signing Fields panel to add the correct signer, field type, page and position. The document wording is protected while you work in this view.</p>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <div data-editor-tool="content" className="min-w-0 overflow-hidden rounded-[18px] border border-[#dbe7f3] bg-white">
                      <div className="border-b border-[#e7eef6] bg-[#fbfdff] px-3 py-3 sm:px-4">
                        <div className="flex min-w-0 flex-col gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                              <p className="shrink-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Quick Add</p>
                              <p className="min-w-0 text-sm leading-6 text-[#607387]">Add commonly used document pieces, then fine tune the wording in the page.</p>
                            </div>
                          </div>
                          <div className="grid min-w-0 gap-2 md:grid-cols-3">
                            <button
                              type="button"
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm font-semibold text-[#233246] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642] disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => handleInsertDocumentBlock('paragraph')}
                              disabled={!canEdit || !selectedSection}
                            >
                              <Type size={15} />
                              <span>Add Clause</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm font-semibold text-[#233246] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642] disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => handleInsertDocumentBlock('signature')}
                              disabled={!canEdit || !selectedSection}
                            >
                              <FileSignature size={15} />
                              <span>Add Signing Block</span>
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm font-semibold text-[#233246] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642] disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => setActiveStudioArea('clauseLibrary')}
                              disabled={!canEdit || !selectedSection}
                            >
                              <Layers3 size={15} />
                              <span>Use Approved Clause</span>
                            </button>
                          </div>
                        </div>

                        <details className="mt-3 rounded-[14px] border border-[#dbe7f3] bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-[#42566d]">
                            <span>More tools</span>
                            <ChevronDown size={15} className="text-[#8aa0b7]" />
                          </summary>
                          <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-[#e7eef6] px-3 py-3">
                            {SECTION_EDITOR_INSERT_GROUPS.map((group) => (
                              <div key={group.label} className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">
                                  {group.label}
                                </span>
                                <div className="inline-flex min-w-0 flex-wrap items-center gap-1 rounded-[12px] border border-[#dbe7f3] bg-white p-1">
                                  {group.items.map((item) => {
                                    const Icon = item.icon
                                    return (
                                      <button
                                        key={item.key}
                                        type="button"
                                        title={item.title}
                                        onClick={item.action === 'source' ? focusSourceEditor : () => handleInsertDocumentBlock(item.key)}
                                        disabled={!canEdit || !selectedSection}
                                        className={[
                                          'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                                          item.action === 'source'
                                            ? 'text-[#52667d] hover:bg-[#f4f7fb] hover:text-[#233246]'
                                            : 'text-[#233246] hover:bg-[#f6fbf8] hover:text-[#128642]',
                                        ].join(' ')}
                                      >
                                        <Icon size={14} />
                                        <span className="truncate">{item.label}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>

                      <div className="bg-[#eef3f8] px-3 py-4 sm:px-4 sm:py-5">
                        <article className="mx-auto min-h-[560px] w-full max-w-[760px] rounded-[8px] border border-[#dbe7f3] bg-white px-4 py-6 shadow-[0_22px_50px_rgba(15,23,42,0.14)] sm:min-h-[680px] sm:px-8 sm:py-8 lg:px-10">
                          {selectedSectionCanvasBlocks.length ? (
                            <div className="space-y-3">
                              {selectedSectionCanvasBlocks.map((block, blockIndex) => {
                                const activeBlock = selectedCanvasBlockIndex === blockIndex
                                if (block.type === 'table') {
                                  return (
                                    <div
                                      key={`canvas-table-${blockIndex}`}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => setSelectedCanvasBlockIndex(blockIndex)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') setSelectedCanvasBlockIndex(blockIndex)
                                      }}
                                      className={[
                                        'rounded-[10px] border px-3 py-3 transition',
                                        activeBlock ? 'border-[#96d7ad] bg-[#f6fbf8] shadow-[0_0_0_3px_rgba(18,134,66,0.08)]' : 'border-transparent hover:border-[#dbe7f3] hover:bg-[#fbfdff]',
                                      ].join(' ')}
                                    >
                                      {renderTemplateEditorMarkdownTable(block.rows, `canvas-table-${blockIndex}`, tokenLabelByKey)}
                                      {activeBlock ? (
                                        <textarea
                                          value={block.raw}
                                          disabled={!canEdit}
                                          onChange={(event) => updateSelectedCanvasBlock(blockIndex, event.target.value)}
                                          className="mt-3 min-h-[120px] w-full resize-y rounded-[10px] border border-[#dbe7f3] bg-white px-3 py-2 font-mono text-xs leading-5 text-[#102033] outline-none focus:border-[#96d7ad] focus:ring-4 focus:ring-[#e7f6ed] disabled:bg-[#f8fbff]"
                                        />
                                      ) : null}
                                    </div>
                                  )
                                }
                                if (block.type === 'page_break') {
                                  return (
                                    <button
                                      key={`canvas-page-break-${blockIndex}`}
                                      type="button"
                                      onClick={() => setSelectedCanvasBlockIndex(blockIndex)}
                                      className={[
                                        'my-4 flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition',
                                        activeBlock ? 'bg-[#f6fbf8] text-[#128642]' : 'text-[#8aa0b7] hover:bg-[#fbfdff]',
                                      ].join(' ')}
                                    >
                                      <span className="h-px flex-1 bg-[#dbe7f3]" />
                                      Page break
                                      <span className="h-px flex-1 bg-[#dbe7f3]" />
                                    </button>
                                  )
                                }
                                if (!activeBlock) {
                                  return (
                                    <button
                                      key={`canvas-paragraph-preview-${blockIndex}`}
                                      type="button"
                                      onClick={() => setSelectedCanvasBlockIndex(blockIndex)}
                                      className="block w-full rounded-[10px] border border-transparent px-3 py-3 text-left text-sm leading-7 text-[#233246] transition hover:border-[#dbe7f3] hover:bg-[#fbfdff] [overflow-wrap:anywhere]"
                                    >
                                      {renderTemplateEditorInline(block.raw, tokenLabelByKey)}
                                    </button>
                                  )
                                }
                                return (
                                  <div
                                    key={`canvas-paragraph-${blockIndex}`}
                                    className={[
                                      'rounded-[10px] border transition',
                                      activeBlock ? 'border-[#96d7ad] bg-[#f6fbf8] shadow-[0_0_0_3px_rgba(18,134,66,0.08)]' : 'border-transparent hover:border-[#dbe7f3] hover:bg-[#fbfdff]',
                                    ].join(' ')}
                                  >
                                    <textarea
                                      value={block.raw}
                                      disabled={!canEdit}
                                      onFocus={() => setSelectedCanvasBlockIndex(blockIndex)}
                                      onClick={() => setSelectedCanvasBlockIndex(blockIndex)}
                                      onChange={(event) => updateSelectedCanvasBlock(blockIndex, event.target.value)}
                                      style={{ minHeight: `${Math.max(72, block.raw.split(/\r?\n/).length * 28 + 32)}px` }}
                                      className="w-full resize-none border-0 bg-transparent px-3 py-3 text-sm leading-7 text-[#233246] outline-none disabled:text-[#7b8da6]"
                                    />
                                    {detectTemplateTokenIssues(block.raw).tokens.length ? (
                                      <div className="flex flex-wrap gap-1.5 border-t border-[#dbe7f3] px-3 py-2">
                                        {detectTemplateTokenIssues(block.raw).tokens.map((token) => (
                                          <span
                                            key={`${blockIndex}-${token}`}
                                            title={`{{${token}}}`}
                                            className="rounded-full bg-[#eef9f1] px-2 py-1 text-[11px] font-semibold text-[#128642]"
                                          >
                                            {tokenLabelByKey[token] || humanizeKey(token)}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="rounded-[10px] border border-dashed border-[#dbe7f3] bg-[#fbfdff] px-5 py-10 text-center">
                              <p className="text-sm font-semibold text-[#102033]">Start with a block</p>
                              <p className="mt-2 text-sm leading-6 text-[#607387]">Add a paragraph, table, signature, initial box, or witness block to build this section visually.</p>
                            </div>
                          )}
                        </article>

                        <details
                          open={showSourceEditor}
                          onToggle={(event) => setShowSourceEditor(event.currentTarget.open)}
                          className="mx-auto mt-5 w-full max-w-[760px] rounded-[14px] border border-[#f4e2bf] bg-[#fffaf1]"
                        >
                          <summary className="flex cursor-pointer list-none flex-col gap-1 px-4 py-3 text-sm text-[#7d520d] sm:flex-row sm:items-center sm:justify-between">
                            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-[#102033]">
                              <AlertTriangle size={15} className="shrink-0 text-[#a66a08]" />
                              <span>Raw source (advanced)</span>
                            </span>
                            <span className="text-xs font-medium text-[#7d520d]">Use only when the visual editor needs cleanup.</span>
                          </summary>
                          <textarea
                            ref={clauseTextareaRef}
                            rows={12}
                            value={selectedSection.legalText}
                            disabled={!canEdit}
                            onChange={(event) => updateSection(selectedSectionIndex, { legalText: event.target.value })}
                            placeholder="Write the wording for this section. Use variables like {{buyer_full_name}} where Arch9 should fill in transaction details."
                            className="min-h-[260px] w-full resize-y border-t border-[#f4e2bf] bg-white px-5 py-5 font-mono text-[13px] leading-6 text-[#102033] outline-none disabled:bg-[#f8fbff] disabled:text-[#7b8da6]"
                          />
                        </details>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7eef6] bg-[#fbfdff] px-5 py-3 text-sm text-[#607387]">
                        <span>Words: {selectedSectionWordCount}</span>
                        <span>Characters: {selectedSectionCharacterCount}</span>
                        <span className={`ml-auto font-semibold ${hasUnsavedChanges ? 'text-[#8a5b06]' : 'text-[#128642]'}`}>
                          {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
                        </span>
                      </div>
                    </div>

                    {selectedSectionTokens.length ? (
                      <div className="flex flex-wrap gap-2 pb-2">
                        {selectedSectionTokenDetails.map((token) => (
                          <button
                            key={token.key}
                            type="button"
                            className="rounded-[8px] border border-[#cdebd8] bg-[#eef9f1] px-2.5 py-1 text-xs font-semibold text-[#0f7438]"
                            title={`{{${token.key}}}`}
                            onClick={() => void handleCopyToken(token.key)}
                          >
                            {token.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <SettingsEmptyState
                    title={normalizedEditorScope === 'situations' && !editorSituation ? 'Choose a conditional section first' : 'Choose a section'}
                    description={normalizedEditorScope === 'situations'
                      ? editorSituation
                        ? `Select the ${editorSituation.label.toLowerCase()} section from the outline.`
                        : 'Choose an exact seller, purchaser, consent, property or finance section above.'
                      : 'Select a section from the outline to edit the document wording.'}
                  />
                )}
              </main>

              <aside
                data-editor-tools-collapsed={editorToolsCollapsed ? 'true' : 'false'}
                className={[
                  'min-w-0 max-w-full space-y-4 overflow-x-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-140px)]',
                  editorToolsCollapsed ? '[&>*:not(:first-child)]:hidden' : 'xl:overflow-y-auto xl:pr-1',
                ].join(' ')}
              >
                <section
                  data-editor-tool="content"
                  className={[
                    'min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.05)]',
                    editorToolsCollapsed ? 'p-3 [&>*:not(:first-child)]:hidden' : 'p-4',
                  ].join(' ')}
                >
                  <div className={editorToolsCollapsed ? 'flex flex-col items-center gap-3' : 'flex items-start justify-between gap-3'}>
                    {editorToolsCollapsed ? (
                      <>
                        <button
                          type="button"
                          className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#dbe7f3] bg-white text-[#52667d] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642]"
                          onClick={() => setEditorToolsCollapsed(false)}
                          aria-label="Expand legal coverage and editor tools"
                          title="Expand Standard Conditions"
                        >
                          <ChevronDown size={16} className="-rotate-90" />
                        </button>
                        <ShieldCheck size={18} className="text-[#128642]" aria-hidden="true" />
                        <span
                          className="rounded-full border border-[#cdebd8] bg-[#eef9f1] px-2 py-1 text-[0.65rem] font-semibold text-[#128642]"
                          title={normalizedEditorScope === 'situations' ? 'Sections selected' : 'Standard conditions covered'}
                        >
                          {normalizedEditorScope === 'situations' ? scopedSectionEntries.length : `${legalConditionCoverage.coveredCount}/${legalConditionCoverage.totalCount}`}
                        </span>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{normalizedEditorScope === 'situations' ? 'Conditional section' : 'Standard Conditions'}</p>
                          <h2 className="mt-2 text-base font-semibold text-[#102033]">{normalizedEditorScope === 'situations' ? editorSituation?.label || 'Choose a section' : 'Legal Coverage'}</h2>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-[#cdebd8] bg-[#eef9f1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#128642]">
                            {normalizedEditorScope === 'situations' ? scopedSectionEntries.length : `${legalConditionCoverage.coveredCount}/${legalConditionCoverage.totalCount}`}
                          </span>
                          <button
                            type="button"
                            className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#dbe7f3] bg-white text-[#52667d] transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] hover:text-[#128642]"
                            onClick={() => setEditorToolsCollapsed(true)}
                            aria-label="Collapse legal coverage and editor tools"
                            title="Collapse Standard Conditions"
                          >
                            <ChevronDown size={16} className="rotate-90" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {normalizedEditorScope === 'situations' ? (
                    <div className="mt-3">
                      <p className="text-sm leading-6 text-[#607387]">
                        {editorSituation
                          ? `Only the ${editorSituation.label.toLowerCase()} pack is shown. Standard wording remains unchanged.`
                          : 'Choose a conditional section above before editing its legal wording.'}
                      </p>
                      {editorSituation ? (
                        <p className="mt-3 rounded-[12px] border border-[#cdebd8] bg-[#f4fbf7] px-3 py-2 text-xs font-semibold leading-5 text-[#236d46]">
                          Included when {editorSituation.activationLabel}. The inclusion rule is protected.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <p className="mt-3 text-sm leading-6 text-[#607387]">
                        The longer legal wording is organised into sections. Open a row to jump to the wording your attorney can review.
                      </p>

                      <div className="mt-4 space-y-2">
                        {legalConditionCoverage.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          if (item.firstSectionIndex !== null) setSelectedSectionIndex(item.firstSectionIndex)
                        }}
                        disabled={item.firstSectionIndex === null}
                        className={[
                          'w-full rounded-[14px] border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70',
                          item.covered
                            ? 'border-[#dbe7f3] bg-[#fbfdff] hover:border-[#96d7ad] hover:bg-[#f6fbf8]'
                            : 'border-dashed border-[#dbe7f3] bg-white',
                        ].join(' ')}
                        title={item.sectionLabels.length ? item.sectionLabels.join(', ') : 'Not found in this template'}
                      >
                        <span className="flex items-start gap-2">
                          {item.covered ? (
                            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#128642]" />
                          ) : (
                            <CircleDot size={14} className="mt-0.5 shrink-0 text-[#9fb0c4]" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-[#102033]">{item.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-[#607387]">
                              {item.covered
                                ? `${item.count} section${item.count === 1 ? '' : 's'} included`
                                : 'Not included in this template'}
                            </span>
                          </span>
                        </span>
                      </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-[#dbe7f3] bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#24518a] transition hover:bg-white"
                        onClick={() => setActiveStudioArea('clauseLibrary')}
                      >
                        <Layers3 size={14} />
                        <span>Use Approved Clauses</span>
                      </button>
                    </>
                  )}
                </section>

                <section data-editor-tool="content" className="min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Inspector</p>
                      <h2 className="mt-2 text-base font-semibold text-[#102033]">Block</h2>
                    </div>
                    <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                      {selectedCanvasBlock?.type ? selectedCanvasBlock.type.replace(/_/g, ' ') : 'none'}
                    </span>
                  </div>

                  {selectedCanvasBlock ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3">
                        <p className="text-sm font-semibold text-[#102033]">Block {selectedCanvasBlockIndex + 1}</p>
                        <p className="mt-1 text-sm leading-5 text-[#607387]">
                          {selectedCanvasBlock.type === 'table'
                            ? 'Table content is still stored as markdown for safe generation.'
                            : selectedCanvasBlock.type === 'page_break'
                              ? 'This block marks where a new page should begin.'
                              : 'Edit this block on the document page.'}
                        </p>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <button
                          type="button"
                          className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                          onClick={() => handleInsertDocumentBlock('signature')}
                          disabled={!canEdit}
                        >
                          <FileSignature size={14} />
                          <span>Signature</span>
                        </button>
                        <button
                          type="button"
                          className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                          onClick={() => handleInsertDocumentBlock('initials')}
                          disabled={!canEdit}
                        >
                          <Check size={14} />
                          <span>Initials</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        className="w-full rounded-[12px] border border-[#dbe7f3] bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#24518a] transition hover:bg-white"
                        onClick={focusSourceEditor}
                      >
                        Raw source (advanced)
                      </button>

                      <div className="rounded-[14px] border border-[#dbe7f3] bg-[#fbfdff] px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#102033]">Section lock</p>
                          <span className={[
                            'rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold',
                            selectedSectionGovernance.locked ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]' : 'border-[#dbe7f3] bg-white text-[#607387]',
                          ].join(' ')}
                          >
                            {selectedSectionGovernance.locked ? 'Locked' : 'Open'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-[10px] border border-[#dbe7f3] bg-white px-3 py-2 text-xs font-semibold text-[#24518a] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!canPublishTemplate || !selectedSection}
                          onClick={() => updateSelectedSectionGovernance({
                            locked: !selectedSectionGovernance.locked,
                            locked_by_role: !selectedSectionGovernance.locked ? 'principal' : null,
                            lockReason: !selectedSectionGovernance.locked ? 'Approved wording' : '',
                          })}
                        >
                          {selectedSectionGovernance.locked ? 'Unlock wording' : 'Lock approved wording'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#607387]">
                      Select or add a block on the canvas to inspect it.
                    </p>
                  )}
                </section>

                {selectedSectionConditionRuleLocked ? (
                  <section
                    data-editor-tool="situation"
                    className="min-w-0 max-w-full rounded-[20px] border border-[#cdebd8] bg-[#f4fbf7] p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]"
                    aria-labelledby="protected-inclusion-rule-heading"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#56806a]">Canonical resolver</p>
                        <h2 id="protected-inclusion-rule-heading" className="mt-2 text-base font-semibold text-[#18372a]">Included automatically</h2>
                        <p className="mt-1 text-sm leading-5 text-[#5f786b]">The transaction facts decide whether this section appears.</p>
                      </div>
                      <span className="rounded-full border border-[#bfe0cc] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#167449]">Protected</span>
                    </div>
                    <p className="mt-3 rounded-[14px] border border-[#cdebd8] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[#236d46]">
                      {selectedSectionConditionSummary}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[#5f786b]">You can still edit the clause wording. Use the document page above; changing this rule requires a platform master update and scenario regression review.</p>
                  </section>
                ) : (
                <details
                  data-editor-tool="situation"
                  defaultOpen={selectedSectionCondition.enabled}
                  className="group min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Optional</p>
                      <h2 className="mt-2 text-base font-semibold text-[#102033]">Show Clause When</h2>
                      <p className="mt-1 text-sm leading-5 text-[#607387]">Only use this when a section should appear for certain deals.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                        selectedSectionCondition.enabled ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]' : 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]',
                      ].join(' ')}
                      >
                        {selectedSectionCondition.enabled ? 'On' : 'Off'}
                      </span>
                      <ChevronDown size={15} className="mt-1 text-[#8aa0b7] transition group-open:rotate-180" />
                    </div>
                  </summary>

                  <p className="mt-3 rounded-[14px] border border-[#dbe7f3] bg-[#fbfdff] px-3 py-2 text-sm leading-6 text-[#52667d]">
                    {selectedSectionConditionSummary}
                  </p>

                  <div className="mt-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-[#102033]">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedSectionCondition.enabled)}
                        disabled={!selectedSection || !canEdit || selectedSectionConditionRuleLocked}
                        onChange={(event) => updateSelectedSectionCondition({ enabled: event.target.checked })}
                        className="h-4 w-4 rounded border-[#dbe7f3] text-[#128642] focus:ring-[#96d7ad]"
                      />
                      Include only when a rule matches
                    </label>

                    <label className={settingsFieldClass}>
                      Data field
                      <select
                        value={selectedSectionCondition.field}
                        disabled={!selectedSection || !canEdit || selectedSectionConditionRuleLocked || !selectedSectionCondition.enabled}
                        onChange={(event) => updateSelectedSectionCondition({ field: event.target.value })}
                      >
                        {conditionFieldOptions.map((field) => (
                          <option key={field.key} value={field.key}>
                            {getFieldOptionLabel(field, tokenLabelByKey)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={settingsFieldClass}>
                      Rule
                      <select
                        value={selectedSectionCondition.operator}
                        disabled={!selectedSection || !canEdit || selectedSectionConditionRuleLocked || !selectedSectionCondition.enabled}
                        onChange={(event) => updateSelectedSectionCondition({ operator: event.target.value })}
                      >
                        {CONDITION_OPERATORS.map((operator) => (
                          <option key={operator.key} value={operator.key}>{operator.label}</option>
                        ))}
                      </select>
                    </label>

                    {!VISIBILITY_VALUELESS_OPERATORS.includes(selectedSectionCondition.operator) ? (
                      <label className={settingsFieldClass}>
                        Value
                        <input
                          type="text"
                          value={selectedSectionCondition.value}
                          disabled={!selectedSection || !canEdit || selectedSectionConditionRuleLocked || !selectedSectionCondition.enabled}
                          onChange={(event) => updateSelectedSectionCondition({ value: event.target.value })}
                          placeholder={['in', 'not_in'].includes(selectedSectionCondition.operator) ? 'company, trust, individual' : 'Bond, Cash, Company...'}
                        />
                      </label>
                    ) : null}

                    <button
                      type="button"
                      className="w-full rounded-[12px] border border-[#dbe7f3] bg-[#f8fbff] px-3 py-2.5 text-sm font-semibold text-[#24518a] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={clearSelectedSectionCondition}
                      disabled={!selectedSection || !canEdit || selectedSectionConditionRuleLocked || !selectedSectionCondition.enabled}
                    >
                      Clear condition
                    </button>
                  </div>
                </details>
                )}

                <details
                  data-editor-tool="signing"
                  {...(normalizedEditorScope === 'signing'
                    ? { open: true }
                    : { defaultOpen: Boolean(selectedSigningFields.length) })}
                  className="group min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]"
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Optional</p>
                      <h2 className="mt-2 text-base font-semibold text-[#102033]">Signing Fields</h2>
                      <p className="mt-1 text-sm leading-5 text-[#607387]">Add boxes only when this section needs a signature, date, witness, or initials.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                        {selectedSigningFields.length} field{selectedSigningFields.length === 1 ? '' : 's'}
                      </span>
                      <ChevronDown size={15} className="mt-1 text-[#8aa0b7] transition group-open:rotate-180" />
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <button
                      type="button"
                      className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                      onClick={() => addSelectedSectionSigningField('signature', packetType === 'mandate' ? 'seller' : 'purchaser_1')}
                      disabled={!selectedSection || !canEdit}
                    >
                      <FileSignature size={14} />
                      <span>Signature</span>
                    </button>
                    <button
                      type="button"
                      className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                      onClick={() => addSelectedSectionSigningField('initial', packetType === 'mandate' ? 'seller' : 'purchaser_1')}
                      disabled={!selectedSection || !canEdit}
                    >
                      <Check size={14} />
                      <span>Initials</span>
                    </button>
                    <button
                      type="button"
                      className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                      onClick={() => addSelectedSectionSigningField('signature', 'witness_1')}
                      disabled={!selectedSection || !canEdit}
                    >
                      <ShieldCheck size={14} />
                      <span>Witness</span>
                    </button>
                    <button
                      type="button"
                      className={`${studioSecondaryButtonClass} min-w-0 px-3`}
                      onClick={() => addSelectedSectionSigningField('date', packetType === 'mandate' ? 'seller' : 'purchaser_1')}
                      disabled={!selectedSection || !canEdit}
                    >
                      <Clock3 size={14} />
                      <span>Date</span>
                    </button>
                  </div>

                  <div className="mt-4 rounded-[16px] border border-[#dbe7f3] bg-[#eef3f8] p-3">
                    <div
                      className="relative mx-auto w-full max-w-[210px] overflow-hidden rounded-[8px] border border-[#dbe7f3] bg-white shadow-[0_12px_24px_rgba(15,23,42,0.10)]"
                      style={{ aspectRatio: `${SIGNING_FIELD_PAGE.width} / ${SIGNING_FIELD_PAGE.height}` }}
                    >
                      <div className="absolute left-[12%] right-[12%] top-[10%] h-2 rounded-full bg-[#e7eef6]" />
                      <div className="absolute left-[12%] right-[18%] top-[16%] h-1.5 rounded-full bg-[#edf2f7]" />
                      <div className="absolute left-[12%] right-[14%] top-[21%] h-1.5 rounded-full bg-[#edf2f7]" />
                      <div className="absolute left-[12%] right-[20%] top-[26%] h-1.5 rounded-full bg-[#edf2f7]" />
                      {selectedSigningFieldPreviewLayout.map((field) => (
                        <div
                          key={`planned-field-preview-${field.id}`}
                          className={[
                            'absolute flex items-center justify-center overflow-hidden rounded-[4px] border px-1 text-[7px] font-semibold leading-none shadow-[0_4px_8px_rgba(15,23,42,0.10)]',
                            field.fieldType === 'signature'
                              ? 'border-[#96d7ad] bg-[#eef9f1] text-[#0f7438]'
                              : field.fieldType === 'initial'
                                ? 'border-[#bcd6ff] bg-[#eef5ff] text-[#24518a]'
                                : 'border-[#ead49c] bg-[#fff8ec] text-[#7d520d]',
                          ].join(' ')}
                          style={{
                            left: `${Math.min(92, Math.max(0, (field.previewX / SIGNING_FIELD_PAGE.width) * 100))}%`,
                            top: `${Math.min(94, Math.max(0, (field.previewY / SIGNING_FIELD_PAGE.height) * 100))}%`,
                            width: `${Math.max(7, (field.previewWidth / SIGNING_FIELD_PAGE.width) * 100)}%`,
                            height: `${Math.max(2.4, (field.previewHeight / SIGNING_FIELD_PAGE.height) * 100)}%`,
                          }}
                          title={`${getSignerRoleLabel(field.signerRole)} ${getSigningFieldTypeLabel(field.fieldType)}`}
                        >
                          {field.fieldType === 'initial' ? 'IN' : field.fieldType === 'date' ? 'DATE' : 'SIGN'}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-xs font-semibold text-[#607387]">
                      Fields are placed on the generated PDF.
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedSigningFields.length ? selectedSigningFields.map((field, index) => (
                      <div key={`planned-field-${field.id}`} className="min-w-0 rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[#102033]">Field {index + 1}</p>
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#f3d5d7] bg-white text-[#b4383e] transition hover:bg-[#fff6f6] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => removeSelectedSectionSigningField(field.id)}
                            disabled={!canEdit}
                            aria-label="Remove signing field"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="mt-3 grid min-w-0 gap-2">
                          <label className={settingsFieldClass}>
                            Signer
                            <select
                              value={field.signerRole}
                              disabled={!selectedSection || !canEdit}
                              onChange={(event) => updateSelectedSectionSigningField(field.id, { signerRole: event.target.value })}
                            >
                              {SIGNER_ROLE_OPTIONS.map((roleOption) => (
                                <option key={roleOption.key} value={roleOption.key}>{roleOption.label}</option>
                              ))}
                            </select>
                          </label>

                          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <label className={settingsFieldClass}>
                              Type
                              <select
                                value={field.fieldType}
                                disabled={!selectedSection || !canEdit}
                                onChange={(event) => updateSelectedSectionSigningField(field.id, { fieldType: event.target.value })}
                              >
                                {SIGNING_FIELD_TYPE_OPTIONS.map((typeOption) => (
                                  <option key={typeOption.key} value={typeOption.key}>{typeOption.label}</option>
                                ))}
                              </select>
                            </label>

                            <label className={settingsFieldClass}>
                              Page
                              <input
                                type="number"
                                min="1"
                                value={field.pageNumber}
                                disabled={!selectedSection || !canEdit}
                                onChange={(event) => updateSelectedSectionSigningField(field.id, { pageNumber: event.target.value })}
                              />
                            </label>
                          </div>

                          <label className={settingsFieldClass}>
                            Position
                            <select
                              value=""
                              disabled={!selectedSection || !canEdit}
                              onChange={(event) => {
                                const preset = SIGNING_FIELD_POSITION_PRESETS.find((item) => item.key === event.target.value)
                                if (preset) updateSelectedSectionSigningField(field.id, { xPosition: preset.x, yPosition: preset.y })
                              }}
                            >
                              <option value="">Custom: x {Math.round(field.xPosition)}, y {Math.round(field.yPosition)}</option>
                              {SIGNING_FIELD_POSITION_PRESETS.map((preset) => (
                                <option key={preset.key} value={preset.key}>{preset.label}</option>
                              ))}
                            </select>
                          </label>

                          <label className="flex items-center gap-2 text-sm font-semibold text-[#102033]">
                            <input
                              type="checkbox"
                              checked={Boolean(field.required)}
                              disabled={!selectedSection || !canEdit}
                              onChange={(event) => updateSelectedSectionSigningField(field.id, { required: event.target.checked })}
                              className="h-4 w-4 rounded border-[#dbe7f3] text-[#128642] focus:ring-[#96d7ad]"
                            />
                            Required field
                          </label>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-[14px] border border-dashed border-[#dbe7f3] bg-[#fbfdff] px-3 py-4 text-sm leading-6 text-[#607387]">
                        Add signatures, initials, witness fields, or date boxes for this section.
                      </p>
                    )}
                  </div>
                </details>

                <details
                  data-editor-tool="content"
                  defaultOpen
                  className="group min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Insert</p>
                      <h2 className="mt-2 text-base font-semibold text-[#102033]">Fields</h2>
                    </div>
                    <ChevronDown size={15} className="text-[#8aa0b7] transition group-open:rotate-180" />
                  </summary>
                  <label className="relative mt-4 block">
                    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b7]" />
                    <input
                      type="text"
                      value={mergeFieldSearch}
                      onChange={(event) => setMergeFieldSearch(event.target.value)}
                      placeholder="Search fields..."
                      className="w-full rounded-[12px] border border-[#dbe7f3] bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#96d7ad] focus:ring-4 focus:ring-[#e7f6ed]"
                    />
                  </label>

                  <div className="mt-4 space-y-2">
                    {simpleVariableGroups.length ? simpleVariableGroups.map((group) => (
                      <details key={group.category} className="rounded-[14px] border border-transparent bg-white open:border-[#dbe7f3] open:bg-[#fbfdff]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-sm font-semibold text-[#102033] hover:bg-[#f8fbff]">
                          <span>{group.category}</span>
                          <ChevronDown size={15} className="text-[#8aa0b7]" />
                        </summary>
                        <div className="grid gap-2 px-3 pb-3">
                          {group.rows.slice(0, 8).map((field) => (
                            <button
                              key={field.key}
                              type="button"
                              className="min-w-0 rounded-[10px] border border-[#e4ebf2] bg-white px-3 py-2 text-left transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleInsertVariableToken(field.key)}
                              disabled={!selectedSection || !canEdit}
                            >
                              <span className="block truncate text-sm font-semibold text-[#102033]">{field.displayLabel}</span>
                              <span className="mt-1 block break-all font-mono text-[11px] text-[#128642]">{`{{${field.key}}}`}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )) : (
                      <p className="rounded-[14px] border border-[#dbe7f3] bg-[#fbfdff] px-3 py-4 text-sm text-[#607387]">
                        No fields match your search.
                      </p>
                    )}
                  </div>
                </details>

                <details className="group min-w-0 max-w-full rounded-[20px] border border-[#dbe7f3] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eef9f1] text-[#128642]">
                        <HelpCircle size={18} />
                      </span>
                      <span className="text-base font-semibold text-[#102033]">Help</span>
                    </span>
                    <ChevronDown size={15} className="text-[#8aa0b7] transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-4">
                    <p className="text-sm leading-6 text-[#607387]">
                      Fields are automatically replaced with the correct information when the document is generated.
                    </p>
                    <button
                      type="button"
                      className="mt-4 text-sm font-semibold text-[#128642]"
                      onClick={() => setActiveTab('variables')}
                    >
                      View all fields
                    </button>
                  </div>
                </details>
              </aside>
            </form>

          </>
        ) : (
          <TemplateStudioPanel
            title="No templates yet"
            description="Create your first document template to start editing wording and variables."
          >
            <SettingsEmptyState
              title="No templates found"
              description="There are no template records for this legal document type yet."
              action={
                canEdit ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={studioSecondaryButtonClass} onClick={() => void handleCreateGeneralAddendumTemplate()}>
                      <FileSignature size={15} />
                      <span>General Addendum</span>
                    </button>
                  </div>
                ) : null
              }
            />
          </TemplateStudioPanel>
        )
      ) : null}

      {activeStudioArea === 'templates' && activeTab === 'legacyTemplate' ? (
        selectedTemplate ? (
          <>
            <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_400px] xl:items-start">
              <div className="space-y-6 xl:sticky xl:top-4">
                <TemplateStudioPanel
                  eyebrow="Template Library"
                  title="Template List"
                  description="Select the version you want to update, review, or publish."
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[1.02rem] font-semibold text-[#102033]">{selectedTemplate.template_label || selectedTemplate.template_key}</p>
                        <p className="text-sm leading-6 text-[#6b7c93]">{selectedTemplate.description || 'Default structured template for agency transactions.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.is_default ? <TemplateStatusPill status="active">Default</TemplateStatusPill> : null}
                        <TemplateStatusPill status={normalizeTemplateStatus(selectedTemplate)}>
                          {TEMPLATE_STATUS_OPTIONS.find((item) => item.key === normalizeTemplateStatus(selectedTemplate))?.label || 'Draft'}
                        </TemplateStatusPill>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        {selectedClassification.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Native' : 'Legacy'}
                      </span>
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        {form.versionTag || selectedTemplate.version_tag || 'v1'}
                      </span>
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        Updated {formatDateOnly(selectedTemplate.updated_at)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selectedList.map((template) => {
                      const active = selectedTemplateId === template.id
                      const classification = classifyTemplateMigrationState(template, packetType)
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(template.id)}
                          className={[
                            'w-full rounded-[20px] border px-4 py-3 text-left transition',
                            active
                              ? 'border-[#bcd6ff] bg-[#eef5ff] shadow-[0_12px_24px_rgba(10,102,255,0.08)]'
                              : 'border-[#e2ecf5] bg-white hover:border-[#c9d9eb] hover:bg-[#fbfdff]',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#102033]">{template.template_label || template.template_key}</p>
                              <p className="mt-1 text-xs text-[#6b7c93]">{template.version_tag || 'v1'} · {formatRenderModeLabel(classification.renderMode)}</p>
                            </div>
                            <span className="text-xs text-[#8aa0b7]">{formatDateOnly(template.updated_at)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </TemplateStudioPanel>

                <TemplateStudioPanel
                  eyebrow="Document Structure"
                  title="Sections"
                  description="Focus on one clause at a time instead of editing every block in a long form."
                  actions={
                    canEdit && selectedIsOrgOwned ? (
                      <button type="button" className={studioSecondaryButtonClass} onClick={addSection}>
                        <Plus size={15} />
                        <span>Add Section</span>
                      </button>
                    ) : null
                  }
                >
                  {(form.sections || []).length ? (
                    <div className="space-y-2">
                      {(form.sections || []).map((section, index) => {
                        const state = sectionStatuses[index]
                        const active = selectedSectionIndex === index
                        const label = section.sectionLabel || `Section ${index + 1}`
                        return (
                          <div
                            key={`${section.sectionKey}-${index}`}
                            className={[
                              'group flex w-full items-center gap-2 rounded-[18px] px-2 py-2 text-left transition',
                              active
                                ? 'border border-[#bcd6ff] bg-[#eef5ff] shadow-[inset_0_0_0_1px_rgba(10,102,255,0.08)]'
                                : 'border border-transparent bg-white hover:border-[#dbe7f3] hover:bg-[#fbfdff]',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedSectionIndex(index)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] px-1 py-1 text-left"
                            >
                              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#0a66ff] shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[#102033]">{label}</span>
                                <span className="block text-xs text-[#6b7c93]">{state.label}</span>
                              </span>
                            </button>
                            <span className="shrink-0">{state.icon}</span>
                            {canEdit && selectedIsOrgOwned ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  removeSection(index)
                                }}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-transparent text-[#9c5a50] opacity-0 transition hover:border-[#f1d2cb] hover:bg-[#fff6f4] hover:text-[#ba3f2d] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#f1d2cb] group-hover:opacity-100"
                                aria-label={`Remove ${label}`}
                                title={`Remove ${label}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <SettingsEmptyState
                      title="No sections configured"
                      description="Create your first section to start structuring this template."
                      action={
                        canEdit && selectedIsOrgOwned ? (
                          <button type="button" className={studioSecondaryButtonClass} onClick={addSection}>
                            <Plus size={15} />
                            <span>Add Section</span>
                          </button>
                        ) : null
                      }
                    />
                  )}
                </TemplateStudioPanel>
              </div>

              <div className="space-y-6">
                <TemplateStudioPanel
                  eyebrow="Clause Editor"
                  title={selectedSection ? selectedSection.sectionLabel || `Section ${selectedSectionIndex + 1}` : 'No section selected'}
                  description={selectedSection ? `Section ${selectedSectionIndex + 1} of ${(form.sections || []).length}` : 'Select a section from the left to edit.'}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      {selectedIsOrgOwned && canEdit ? (
                        <button type="submit" className={studioPrimaryButtonClass} disabled={saving}>
                          <Save size={15} />
                          <span>{saving ? 'Saving…' : 'Save'}</span>
                        </button>
                      ) : null}
                      {selectedIsOrgOwned && canEdit ? (
                        <button
                          type="button"
                          className={studioSecondaryButtonClass}
                          onClick={openPublishDialog}
                          disabled={
                            saving
                            || Boolean(form.isDefault)
                            || (
                              normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                              && !validationSummary.renderable
                            )
                          }
                        >
                          <ShieldCheck size={15} />
                          <span>{form.isDefault ? 'Live default' : 'Publish'}</span>
                        </button>
                      ) : null}
                    </div>
                  }
                >
                  {!selectedIsOrgOwned ? (
                    <SettingsBanner tone="warning">
                      Arch9 is preparing your agency version. Edits save to that version before it is published.
                    </SettingsBanner>
                  ) : null}

                  {selectedSection ? (
                    <div className="space-y-5">
                      {selectedSectionUnknownTokens.length ? (
                        <SettingsBanner tone="warning">
                          Unknown variables in this section: {selectedSectionUnknownTokens.map((item) => `{{${item.token}}}`).join(', ')}.
                        </SettingsBanner>
                      ) : null}

                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_250px]">
                        <div className="space-y-4">
                          <label className={settingsFieldClass}>
                            Section title
                            <input
                              ref={sectionTitleInputRef}
                              type="text"
                              value={selectedSection.sectionLabel}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionLabel: event.target.value })}
                            />
                          </label>

                          <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f6f9fc] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3edf7] pb-3">
                              <div className="flex items-center gap-2 text-sm font-semibold text-[#102033]">
                                <span className="inline-flex items-center gap-2 rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm">
                                  <Type size={14} />
                                  Plain text editor
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <details className="relative">
                                  <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer`}>
                                    <Sparkles size={14} />
                                    <span>Insert Variable</span>
                                    <ChevronDown size={14} />
                                  </summary>
                                  <div className="absolute right-0 top-full z-20 mt-2 w-[320px] max-h-[420px] overflow-auto rounded-[22px] border border-[#dbe7f3] bg-white p-3 shadow-[0_22px_40px_rgba(15,23,42,0.14)]">
                                    <div className="space-y-3">
                                      {variableGroups.map((group) => (
                                        <div key={group.key} className="rounded-[18px] border border-[#eef3f8] bg-[#fbfdff] p-3">
                                          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{group.label}</p>
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {group.fields.map((field) => (
                                              <button
                                                key={field.key}
                                                type="button"
                                                className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-1.5 text-xs font-semibold text-[#102033] transition hover:border-[#bcd6ff] hover:bg-[#eef5ff]"
                                                onClick={() => handleInsertVariableToken(field.key)}
                                                disabled={!selectedIsOrgOwned || !canEdit}
                                              >
                                                {field.label}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      className="mt-3 w-full rounded-[16px] border border-[#dbe7f3] bg-[#f6f9fc] px-3 py-2.5 text-sm font-semibold text-[#0a66ff] transition hover:bg-[#eef5ff]"
                                      onClick={() => setActiveTab('variables')}
                                    >
                                      View all variables
                                    </button>
                                  </div>
                                </details>

                                <button
                                  type="button"
                                  className={studioQuietButtonClass}
                                  onClick={() => setActiveTab('variables')}
                                >
                                  <Eye size={14} />
                                  <span>View all variables</span>
                                </button>
                              </div>
                            </div>

                            <label className={`${settingsFieldClass} mt-4`}>
                              Clause content
                              <textarea
                                ref={clauseTextareaRef}
                                rows={24}
                                value={selectedSection.legalText}
                                disabled={!canEdit || !selectedIsOrgOwned}
                                onChange={(event) => updateSection(selectedSectionIndex, { legalText: event.target.value })}
                                placeholder="Write the clause text here and place variables where needed, for example {{seller_full_name}}."
                                className="min-h-[620px]"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Section Summary</p>
                            <p className="mt-3 text-base font-semibold text-[#102033]">Section {selectedSectionIndex + 1} of {(form.sections || []).length}</p>
                            <p className="mt-2 text-sm text-[#6b7c93]">{sectionStatuses[selectedSectionIndex]?.label}</p>
                            <p className="mt-3 text-sm text-[#475d75]">Type: {selectedSection.sectionType || 'legal_text'}</p>
                          </div>

                          <div className="rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Variables</p>
                              <button
                                type="button"
                                className="text-sm font-semibold text-[#0a66ff]"
                                onClick={() => setActiveTab('variables')}
                              >
                                View all
                              </button>
                            </div>
                            {selectedSectionTokens.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {selectedSectionTokens.map((token) => (
                                  <span
                                    key={token}
                                    className="inline-flex items-center gap-1 rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#35546c]"
                                  >
                                    <CircleDot size={10} />
                                    {token}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm leading-6 text-[#6b7c93]">No variables used in this clause yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <details className="rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-[#102033]">Block settings</summary>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className={settingsFieldClass}>
                            Section key
                            <input
                              type="text"
                              value={selectedSection.sectionKey}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionKey: event.target.value })}
                            />
                          </label>

                          <label className={settingsFieldClass}>
                            Section type
                            <select
                              value={selectedSection.sectionType}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionType: event.target.value })}
                            >
                              <option value="legal_text">Legal Text</option>
                              <option value="dynamic_fields">Dynamic Fields</option>
                              <option value="conditional_clause">Conditional Clause</option>
                              <option value="annexure">Annexure</option>
                              <option value="signature_zone">Signature Zone</option>
                              <option value="metadata">Metadata</option>
                            </select>
                          </label>

                          <label className={settingsFieldClass}>
                            Sort order
                            <input
                              type="number"
                              value={selectedSection.sortOrder}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sortOrder: Number(event.target.value || 0) })}
                            />
                          </label>

                          <label className={settingsFieldClass}>
                            Merge fields used in this block
                            <input
                              type="text"
                              value={selectedSection.placeholderKeysText || ''}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { placeholderKeysText: event.target.value })}
                              placeholder="seller_full_name, purchase_price"
                            />
                          </label>

                          <div className="rounded-[18px] border border-[#dbe7f3] bg-[#f8fbff] p-4 md:col-span-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-[#102033]">Client signing requirement</p>
                                <p className="mt-1 text-sm leading-5 text-[#6b7c93]">
                                  Choose whether this section needs a client initial or full signature marker.
                                </p>
                              </div>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#607387]">
                                Section-level
                              </span>
                            </div>

                            <div className="mt-4 grid gap-2 md:grid-cols-3">
                              {SECTION_SIGNING_REQUIREMENT_OPTIONS.map((option) => {
                                const active = normalizeSectionSigningRequirement(selectedSection.signingRequirement, {
                                  requiresInitial: selectedSection.requiresInitial,
                                  requiresSignature: selectedSection.requiresSignature,
                                }) === option.key
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    disabled={!canEdit || !selectedIsOrgOwned}
                                    onClick={() => updateSection(selectedSectionIndex, {
                                      signingRequirement: option.key,
                                      requiresInitial: option.key === 'client_initial',
                                      requiresSignature: option.key === 'client_signature',
                                      signingRole: selectedSection.signingRole || 'client',
                                      initialPlaceholderKey: option.key === 'client_initial'
                                        ? selectedSection.initialPlaceholderKey || getDefaultClientSigningPlaceholderKey(packetType, 'client_initial')
                                        : selectedSection.initialPlaceholderKey,
                                      signaturePlaceholderKey: option.key === 'client_signature'
                                        ? selectedSection.signaturePlaceholderKey || getDefaultClientSigningPlaceholderKey(packetType, 'client_signature')
                                        : selectedSection.signaturePlaceholderKey,
                                    })}
                                    className={`rounded-[14px] border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                      active
                                        ? 'border-[#96d7ad] bg-white shadow-[0_10px_24px_rgba(18,134,66,0.10)]'
                                        : 'border-[#dbe7f3] bg-[#fbfdff] hover:border-[#b8d8c4] hover:bg-white'
                                    }`}
                                  >
                                    <span className="block text-sm font-semibold text-[#102033]">{option.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-[#6b7c93]">{option.description}</span>
                                  </button>
                                )
                              })}
                            </div>

                            {selectedSection.requiresInitial ? (
                              <label className={`${settingsFieldClass} mt-4`}>
                                Initial field key
                                <input
                                  type="text"
                                  value={selectedSection.initialPlaceholderKey || ''}
                                  disabled={!canEdit || !selectedIsOrgOwned}
                                  onChange={(event) => updateSection(selectedSectionIndex, { initialPlaceholderKey: event.target.value })}
                                  placeholder="buyer_initials"
                                />
                              </label>
                            ) : null}

                            {selectedSection.requiresSignature ? (
                              <label className={`${settingsFieldClass} mt-4`}>
                                Signature field key
                                <input
                                  type="text"
                                  value={selectedSection.signaturePlaceholderKey || ''}
                                  disabled={!canEdit || !selectedIsOrgOwned}
                                  onChange={(event) => updateSection(selectedSectionIndex, { signaturePlaceholderKey: event.target.value })}
                                  placeholder="buyer_signature"
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>

                        {canEdit && selectedIsOrgOwned ? (
                          <div className="mt-4 flex justify-end">
                            <button type="button" className={studioDangerButtonClass} onClick={() => removeSection(selectedSectionIndex)}>
                              <Trash2 size={14} />
                              <span>Remove Section</span>
                            </button>
                          </div>
                        ) : null}
                      </details>
                    </div>
                  ) : (
                    <SettingsEmptyState
                      title="No section selected"
                      description="Choose a section from the left to edit clause wording and block settings."
                    />
                  )}
                </TemplateStudioPanel>
              </div>

              <div className="space-y-6 xl:sticky xl:top-4">
                <TemplateStudioPanel
                  eyebrow="Preview"
                  title="Document Preview"
                  description="See how the current template will look with safe sample details."
                  actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {['mandate', 'otp'].includes(packetType) ? (
                        <select
                          aria-label="Preview legal scenario"
                          value={templatePreviewScenarioKey}
                          onChange={(event) => {
                            setTemplatePreviewScenarioKey(event.target.value)
                            setPreviewState({ loading: false, html: '', warnings: [], critical: [], dataRequirements: [], error: '' })
                          }}
                          className="min-h-10 rounded-[10px] border border-[#d8e2eb] bg-white px-3 text-sm font-semibold text-[#3b5068]"
                        >
                          {listLegalDocumentPreviewScenarios().map((scenario) => (
                            <option key={scenario.key} value={scenario.key}>{scenario.label}</option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => openTemplatePreview()}
                        disabled={testingTemplate}
                      >
                        <Eye size={14} />
                        <span>{testingTemplate ? 'Previewing...' : 'Open Preview'}</span>
                      </button>
                    </div>
                  }
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f5f7fb] p-4">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">
                      <span>Preview</span>
                      <span>{previewState.html ? 'Current edits rendered' : 'Run preview'}</span>
                    </div>
                    <div className="mt-4 flex min-h-[420px] items-start justify-center overflow-auto rounded-[22px] border border-[#e7eef6] bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#f5f7fb_100%)] p-4">
                      <div className="w-full max-w-[320px] rounded-[18px] border border-[#e2eaf3] bg-white p-6 shadow-[0_24px_40px_rgba(15,23,42,0.12)]">
                        {previewState.loading ? (
                          <SettingsLoadingState compact label="Preparing sample test…" />
                        ) : previewState.error ? (
                          <SettingsBanner tone="error">{previewState.error}</SettingsBanner>
                        ) : previewState.html ? (
                          <div className="space-y-3 text-sm leading-6 text-[#233246]">
                            <div dangerouslySetInnerHTML={{ __html: previewState.html }} />
                          </div>
                        ) : (
                          <SettingsEmptyState
                            title="No preview generated yet"
                            description="Run a preview to see the current edits with safe example details."
                          />
                        )}
                      </div>
                    </div>
                    {previewState.html || previewState.critical.length || previewState.warnings.length ? (
                      <div className="mt-4">
                        <PreviewIssueSummary critical={previewState.critical} warnings={previewState.warnings} compact />
                      </div>
                    ) : null}
                    {previewState.scenarioProfile ? (
                      <div className="mt-4 rounded-[18px] border border-[#dbe7f3] bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[#71849a]">Scenario decision</p>
                          <span className="text-xs font-semibold text-[#26744a]">{previewState.scenarioProfile.scenarioKey}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(previewState.conditionalMasterAudit?.includedPackKeys || previewState.scenarioProfile.activeClausePacks || []).map((pack) => (
                            <span key={pack} className="rounded-full border border-[#cde8d7] bg-[#eef9f2] px-2.5 py-1 text-[0.68rem] font-semibold text-[#247149]">
                              {normalizeText(pack).replace(/_pack$/i, '').replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 text-xs leading-5 text-[#667a90]">
                          Signers: {(previewState.signingAudit?.signers || []).map((signer) => signer.label).join(', ') || 'No signer plan resolved'}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#dbe7f3] bg-white/90 px-4 py-3 text-sm text-[#6b7c93]">
                      <span>Preview uses the current editor values without changing live documents.</span>
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => void handleTestGenerate()}
                        disabled={testingTemplate}
                      >
                        <Eye size={14} />
                        <span>{testingTemplate ? 'Previewing…' : 'Preview'}</span>
                      </button>
                    </div>
                  </div>
                </TemplateStudioPanel>

                <TemplateStudioPanel
                  eyebrow="Checks"
                  title="Ready to Publish"
                  description="A quick view of readiness, field coverage, and safety."
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-[6px] border-[#20b26b] bg-white text-xl font-semibold text-[#102033]">
                        {templateHealthPercent}%
                      </div>
                      <div>
                        <p className="text-base font-semibold text-[#102033]">Ready to Publish</p>
                        <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                          {validationSummary.warnings.length
                            ? `${validationSummary.warnings.length} warning${validationSummary.warnings.length === 1 ? '' : 's'} to review before publishing.`
                            : 'No warning-level issues detected right now.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {studioHealthChecks.map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm ${item.passed ? 'border-[#d6efe1] bg-[#f5fbf8] text-[#1f7a45]' : 'border-[#f6e4bf] bg-[#fffaf1] text-[#8a5b06]'}`}
                      >
                        {item.passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Variables</p>
                        <p className="mt-2 text-[1.65rem] font-semibold text-[#102033]">
                          {resolvedFieldCount}/{validationSummary.tokenCount}
                        </p>
                        <p className="mt-1 text-sm text-[#6b7c93]">
                          {unresolvedFieldCount
                            ? `${unresolvedFieldCount} field${unresolvedFieldCount === 1 ? '' : 's'} still need attention.`
                            : 'All detected variables resolve cleanly.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={studioQuietButtonClass}
                        onClick={() => setActiveTab('variables')}
                      >
                        <Eye size={14} />
                        <span>View all</span>
                      </button>
                    </div>
                  </div>
                </TemplateStudioPanel>
              </div>
            </form>
          </>
        ) : (
          <TemplateStudioPanel
            eyebrow="Template Workspace"
            title="No templates yet"
            description="Create your first template to start building clause content, testing previews, and managing live versions."
          >
            <SettingsEmptyState
              title="No templates found"
              description="There are no template records for this legal document type yet."
              action={
                canEdit ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={studioSecondaryButtonClass} onClick={() => void handleCreateGeneralAddendumTemplate()}>
                      <FileSignature size={15} />
                      <span>General Addendum</span>
                    </button>
                  </div>
                ) : null
              }
            />
          </TemplateStudioPanel>
        )
      ) : null}

      {activeStudioArea === 'templates' && activeTab === 'variables' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <TemplateStudioPanel
              eyebrow="Variable Library"
              title="Insert Variable"
              description="Human-friendly variable groups for clause editing, with the existing raw tokens preserved under the hood."
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className={settingsFieldClass}>
                  Search variables
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b7]" />
                    <input
                      type="text"
                      value={mergeFieldSearch}
                      onChange={(event) => setMergeFieldSearch(event.target.value)}
                      placeholder="Search key, label, description..."
                      className="pl-10"
                    />
                  </div>
                </label>
                <label className={settingsFieldClass}>
                  Category
                  <select
                    value={mergeFieldCategory}
                    onChange={(event) => setMergeFieldCategory(event.target.value)}
                  >
                    {canonicalCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 space-y-4">
                {variableGroups.map((group) => {
                  const groupRows = filteredCanonicalFields.filter((field) => group.categories.includes(normalizeText(field.category)))
                  if (!groupRows.length) return null
                  return (
                    <div key={group.key} className="rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{group.label}</p>
                          <p className="mt-1 text-sm text-[#6b7c93]">{groupRows.length} available variable{groupRows.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {groupRows.map((field) => (
                          <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e7eef6] bg-white px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#102033]">{field.label}</p>
                              <p className="mt-1 font-mono text-[11px] text-[#6b7c93]">{`{{${field.key}}}`}</p>
                              <p className="mt-1 text-xs text-[#8aa0b7]">{field.description}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={studioSecondaryButtonClass}
                                onClick={() => handleInsertVariableToken(field.key)}
                                disabled={!selectedSection || !selectedIsOrgOwned || !canEdit}
                              >
                                <Sparkles size={14} />
                                <span>Insert</span>
                              </button>
                              <button
                                type="button"
                                className={studioQuietButtonClass}
                                onClick={() => void handleCopyToken(field.key)}
                              >
                                <span>Copy Token</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Registry"
                title="Fields"
                description="The saved details this document can fill in automatically."
              >
                <div className="overflow-x-auto rounded-[20px] border border-[#dbe7f3] bg-white">
                  <table className="min-w-[620px] w-full text-left text-sm">
                    <thead className="bg-[#f6f9fc] text-[0.68rem] uppercase tracking-[0.14em] text-[#6b7d93]">
                      <tr>
                        <th className="px-4 py-3">Field</th>
                        <th className="px-4 py-3">Entity</th>
                        <th className="px-4 py-3">Required</th>
                        <th className="px-4 py-3">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placeholderRegistry.length ? placeholderRegistry.map((row) => {
                        const rowKey = normalizeText(row.placeholder_key)
                        const rowSaving = savingPlaceholder === rowKey
                        return (
                          <tr key={`${row.packet_type}-${row.placeholder_key}`} className="border-t border-[#ecf1f6]">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-semibold text-[#162334]">{row.placeholder_key}</p>
                              <p className="text-xs text-[#6b7d93]">{row.description || 'No description yet.'}</p>
                            </td>
                            <td className="px-4 py-3 text-[#445b73]">{row.entity_scope || 'transaction'}</td>
                            <td className="px-4 py-3">
                              <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.is_required_default)}
                                  disabled={!canEdit || rowSaving}
                                  onChange={(event) => void togglePlaceholderFlag(row, 'isRequiredDefault', event.target.checked)}
                                />
                                Required
                              </label>
                            </td>
                            <td className="px-4 py-3">
                              <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                                <input
                                  type="checkbox"
                                  checked={row.is_active !== false}
                                  disabled={!canEdit || rowSaving}
                                  onChange={(event) => void togglePlaceholderFlag(row, 'isActive', event.target.checked)}
                                />
                                Active
                              </label>
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr>
                          <td className="px-4 py-6 text-sm text-[#6b7d93]" colSpan={4}>
                            No saved fields yet for this template type.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TemplateStudioPanel>

              {canEdit ? (
                <TemplateStudioPanel
                  eyebrow="Data Governance"
                  title="Add Custom Variable"
                  description="Create an extra field without changing how existing documents fill themselves in."
                >
                  <div className={settingsGridClass}>
                    <label className={settingsFieldClass}>
                      Placeholder key
                      <input
                        type="text"
                        value={placeholderForm.placeholderKey}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, placeholderKey: event.target.value }))}
                        placeholder="seller_full_name"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Entity scope
                      <input
                        type="text"
                        value={placeholderForm.entityScope}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, entityScope: event.target.value }))}
                        placeholder="transaction"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Data type
                      <input
                        type="text"
                        value={placeholderForm.dataType}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, dataType: event.target.value }))}
                        placeholder="text"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Example value
                      <input
                        type="text"
                        value={placeholderForm.exampleValue}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, exampleValue: event.target.value }))}
                      />
                    </label>
                    <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                      Description
                      <textarea
                        rows={3}
                        value={placeholderForm.description}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, description: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                      <input
                        type="checkbox"
                        checked={Boolean(placeholderForm.isRequiredDefault)}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isRequiredDefault: event.target.checked }))}
                      />
                      Required by default
                    </label>
                    <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                      <input
                        type="checkbox"
                        checked={placeholderForm.isActive !== false}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className={studioPrimaryButtonClass}
                      onClick={(event) => void handleSavePlaceholder(event)}
                      disabled={Boolean(savingPlaceholder)}
                    >
                      <Plus size={15} />
                      <span>{savingPlaceholder ? 'Saving…' : 'Save Variable'}</span>
                    </button>
                  </div>
                </TemplateStudioPanel>
              ) : null}
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to manage its variables."
          />
        )
      ) : null}

      {activeStudioArea === 'templates' && activeTab === 'settings' ? (
        selectedTemplate ? (
          <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <TemplateStudioPanel
              eyebrow="Publishing"
              title="Document Metadata"
              description="Name, describe, and choose whether this version is available to the team."
            >
              <div className={settingsGridClass}>
                <label className={settingsFieldClass}>
                  Template name
                  <input
                    type="text"
                    value={form.templateLabel}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, templateLabel: event.target.value }))}
                  />
                </label>

                <label className={settingsFieldClass}>
                  Version label
                  <input
                    type="text"
                    value={form.versionTag}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, versionTag: event.target.value }))}
                  />
                </label>

                <label className={settingsFieldClass}>
                  Status
                  <select
                    value={form.templateStatus}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, templateStatus: event.target.value }))}
                  >
                    {TEMPLATE_STATUS_OPTIONS.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                </label>

                {['mandate', 'otp'].includes(packetType) ? (
                  <div className={`${settingsFieldSpanClass} rounded-[18px] border border-[#cdebd8] bg-[#eef9f1] p-4`}>
                    <p className="text-sm font-semibold text-[#102033]">Conditional master document</p>
                    <p className="mt-2 text-xs leading-5 text-[#52667d]">
                      This is the organisation’s single editable master. Seller, buyer, property, marital and finance facts control which conditional sections appear; they do not select another template.
                    </p>
                  </div>
                ) : null}

                <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isActive)}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                  />
                  Make this version available to the team
                </label>

                <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                  Description
                  <textarea
                    rows={4}
                    value={form.description}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                    placeholder="Short note to help your team know when to use this version."
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Ownership</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{selectedIsOrgOwned ? 'Organisation version' : 'Shared base version'}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {selectedIsOrgOwned
                      ? 'Your team can edit this version, save changes, and publish it.'
                      : 'Arch9 automatically opens an agency version before edits are saved.'}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Generation Mode</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{formatRenderModeLabel(selectedClassification.renderMode)}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {selectedClassification.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                      ? 'Built from sections and merge fields inside Arch9.'
                      : 'Uses an uploaded DOCX file as the base template.'}
                  </p>
                </div>
                {['mandate', 'otp'].includes(packetType) ? (
                  <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Generation model</p>
                    <p className="mt-3 text-sm font-semibold text-[#102033]">One conditional master</p>
                    <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                      The generator evaluates the sections in this revision against the saved legal scenario facts.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Automatic Use</p>
                    <p className="mt-3 text-sm font-semibold text-[#102033]">{getOtpLegalRouteSummary(form)}</p>
                    <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                      Agents never choose this template manually. Arch9 matches it from the legal setup answers.
                    </p>
                  </div>
                )}
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Live Use</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{form.isDefault ? 'Currently live default' : 'Not the live default'}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {form.isDefault
                      ? 'New documents of this type already start from this version.'
                      : 'Publish this version when you are ready for new documents to use it.'}
                  </p>
                </div>
              </div>

              {LEGACY_SCENARIO_TEMPLATE_ROUTING_UI_ENABLED && packetType === 'otp' && otpTemplateCoverageAudit ? (
                <div className="mt-5 rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Live Routing</p>
                      <h3 className="mt-2 text-base font-semibold text-[#102033]">OTP Template Coverage</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                        {otpTemplateCoverageAudit.targetedCount} specialised rule{otpTemplateCoverageAudit.targetedCount === 1 ? '' : 's'} plus {otpTemplateCoverageAudit.genericCount} broad fallback{otpTemplateCoverageAudit.genericCount === 1 ? '' : 's'} are available.
                      </p>
                    </div>
                    <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${otpTemplateCoverageAudit.hasGenericFallback && !otpTemplateCoverageAudit.conflictCount ? 'bg-[#e8f7ef] text-[#24734d]' : 'bg-[#fff3df] text-[#9a5d00]'}`}>
                      {otpTemplateCoverageAudit.hasGenericFallback && !otpTemplateCoverageAudit.conflictCount ? 'Routing ready' : 'Review routing'}
                    </span>
                  </div>

                  {!otpTemplateCoverageAudit.hasGenericFallback ? (
                    <div className="mt-4">
                      <SettingsBanner tone="warning">
                        Add one live template with every “Used when…” field set to Any. It safely catches valid situations that do not yet have specialised wording.
                      </SettingsBanner>
                    </div>
                  ) : null}
                  {otpTemplateCoverageAudit.conflictCount ? (
                    <div className="mt-4">
                      <SettingsBanner tone="warning">
                        {otpTemplateCoverageAudit.conflictCount} duplicate live routing rule{otpTemplateCoverageAudit.conflictCount === 1 ? '' : 's'} found. Give each live template a unique “Used when…” combination so the selected wording is predictable.
                      </SettingsBanner>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2">
                    {otpTemplateCoverageAudit.entries.map((entry) => (
                      <div key={entry.id || entry.key || entry.signature} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm font-semibold text-[#102033]">{entry.label}</p>
                          <span className="text-xs font-semibold text-[#6b7c93]">{entry.isGeneric ? 'Fallback' : entry.isExactScenario ? 'Exact match' : 'Rule match'}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">{getOtpCoverageEntrySummary(entry)}</p>
                      </div>
                    ))}
                    {!otpTemplateCoverageAudit.entries.length ? (
                      <p className="rounded-[16px] border border-dashed border-[#cddbeb] px-4 py-5 text-sm text-[#6b7c93]">
                        No live OTP templates are routable yet. Publish a broad fallback first.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {LEGACY_SCENARIO_TEMPLATE_ROUTING_UI_ENABLED && packetType === 'mandate' ? (
                <div className="mt-5 rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Variant Pack</p>
                      <h3 className="mt-2 text-base font-semibold text-[#102033]">Mandate Situation Templates</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                        {liveMandateVariantCount}/{mandateVariantOptions.length} variants are live and routable.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={studioSecondaryButtonClass}
                      disabled={!canEdit || creatingMandateVariants || !missingMandateVariantOptions.length}
                      onClick={() => void handleCreateMissingMandateVariantTemplates()}
                    >
                      <CopyPlus size={14} />
                      <span>{creatingMandateVariants ? 'Creating…' : 'Create Missing Variants'}</span>
                    </button>
                  </div>

                  {missingMandateVariantOptions.length || liveMandateVariantCount < mandateVariantOptions.length ? (
                    <SettingsBanner tone={missingMandateVariantOptions.length ? 'warning' : 'success'}>
                      {missingMandateVariantOptions.length
                        ? `${missingMandateVariantOptions.length} mandate route${missingMandateVariantOptions.length === 1 ? '' : 's'} still need draft templates before they can be reviewed and published.`
                        : 'All mandate routes have templates. Publish each route when its wording is approved.'}
                    </SettingsBanner>
                  ) : null}

                  {mandateOperationalAudit ? (
                    <div className={[
                      'mt-4 rounded-[18px] border p-4',
                      mandateOperationalAudit.status === 'blocked'
                        ? 'border-[#f3d1ce] bg-[#fff4f3]'
                        : mandateOperationalAudit.status === 'attention'
                          ? 'border-[#f6e4bf] bg-[#fffaf1]'
                          : 'border-[#cdebd8] bg-[#eef9f1]',
                    ].join(' ')}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Operational Audit</p>
                          <h4 className="mt-2 text-sm font-semibold text-[#102033]">
                            {mandateOperationalAudit.status === 'blocked'
                              ? 'Live mandate templates need fixing'
                              : mandateOperationalAudit.status === 'attention'
                                ? 'Mandate routes need review'
                                : 'Mandate templates are audit-ready'}
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                            {mandateOperationalAudit.summary.verifiedLiveTemplateCount}/{mandateOperationalAudit.summary.liveTemplateCount} live templates are verified by the content gate.
                          </p>
                        </div>
                        <span className={[
                          'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                          mandateOperationalAudit.status === 'blocked'
                            ? 'border-[#e9b7b2] bg-white text-[#8e1f15]'
                            : mandateOperationalAudit.status === 'attention'
                              ? 'border-[#f1d49d] bg-white text-[#8a5b06]'
                              : 'border-[#b8e5c7] bg-white text-[#128642]',
                        ].join(' ')}
                        >
                          {mandateOperationalAudit.auditVersion}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-4">
                        {[
                          { label: 'Blocked live', value: mandateOperationalAudit.summary.blockedLiveTemplateCount },
                          { label: 'Unverified live', value: mandateOperationalAudit.summary.unverifiedLiveTemplateCount },
                          { label: 'Missing routes', value: mandateOperationalAudit.summary.missingRouteCount },
                          { label: 'Draft routes', value: mandateOperationalAudit.summary.draftOnlyRouteCount },
                        ].map((item) => (
                          <div key={`mandate-audit-${item.label}`} className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-2">
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">{item.label}</p>
                            <p className="mt-1 text-xl font-semibold text-[#102033]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {mandateOperationalAudit.actions.length ? (
                        <div className="mt-3 space-y-2">
                          {mandateOperationalAudit.actions.slice(0, 3).map((action) => (
                            <p key={`${action.code}-${action.routeKey}-${action.templateId}`} className={[
                              'rounded-[14px] border bg-white px-3 py-2 text-xs leading-5',
                              action.priority === 'blocker'
                                ? 'border-[#f3d1ce] text-[#8e1f15]'
                                : 'border-[#f6e4bf] text-[#8a5b06]',
                            ].join(' ')}
                            >
                              <span className="font-semibold">{action.message}</span> {action.remediation}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {mandateLaunchReadiness ? (
                    <div className={[
                      'mt-4 rounded-[18px] border p-4',
                      mandateLaunchReadiness.status === 'blocked'
                        ? 'border-[#f3d1ce] bg-[#fff4f3]'
                        : mandateLaunchReadiness.status === 'attention'
                          ? 'border-[#f6e4bf] bg-[#fffaf1]'
                          : 'border-[#cdebd8] bg-[#eef9f1]',
                    ].join(' ')}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Launch Readiness</p>
                          <h4 className="mt-2 text-sm font-semibold text-[#102033]">
                            {mandateLaunchReadiness.status === 'blocked'
                              ? 'Mandate automation is locked'
                              : mandateLaunchReadiness.status === 'attention'
                                ? 'Mandate automation needs sign-off'
                                : 'Mandate automation is ready'}
                          </h4>
                          <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                            {mandateLaunchReadiness.summary.readyRouteCount}/{mandateLaunchReadiness.summary.requiredRouteCount} mandate routes have verified live templates.
                          </p>
                        </div>
                        <span className={[
                          'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                          mandateLaunchReadiness.canEnableMandateAutomation
                            ? 'border-[#b8e5c7] bg-white text-[#128642]'
                            : 'border-[#e9b7b2] bg-white text-[#8e1f15]',
                        ].join(' ')}
                        >
                          {mandateLaunchReadiness.canEnableMandateAutomation ? 'Ready' : 'Locked'}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-3">
                        {[
                          { label: 'Ready routes', value: mandateLaunchReadiness.summary.readyRouteCount },
                          { label: 'Blocked routes', value: mandateLaunchReadiness.summary.blockedRouteCount },
                          { label: 'Launch blockers', value: mandateLaunchReadiness.summary.blockerCount },
                        ].map((item) => (
                          <div key={`mandate-launch-${item.label}`} className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-2">
                            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">{item.label}</p>
                            <p className="mt-1 text-xl font-semibold text-[#102033]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {mandateLaunchReadiness.blockers.length ? (
                        <div className="mt-3 space-y-2">
                          {mandateLaunchReadiness.blockers.slice(0, 3).map((issue) => (
                            <p key={`${issue.code}-${issue.routeKey}-${issue.templateId}`} className="rounded-[14px] border border-[#f3d1ce] bg-white px-3 py-2 text-xs leading-5 text-[#8e1f15]">
                              <span className="font-semibold">{issue.message}</span> {issue.remediation}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {mandateVariantCoverageRows.map((option) => {
                      const readiness = option.readiness
                      const statusClass = readiness.key === 'live'
                        ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]'
                        : readiness.key === 'needs_setup'
                          ? 'border-[#f6e4bf] bg-[#fffaf1] text-[#8a5b06]'
                          : readiness.key === 'draft'
                            ? 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]'
                            : 'border-[#f3d1ce] bg-[#fff4f3] text-[#8e1f15]'
                      return (
                        <div key={option.key} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#dbe7f3] bg-white px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#102033]">{option.label}</p>
                            <p className="mt-1 font-mono text-[11px] text-[#6b7c93]">{option.key}</p>
                            {option.template ? (
                              <p className="mt-1 truncate text-xs text-[#8aa0b7]">
                                {option.template.template_label || option.template.template_key || 'Untitled template'}
                              </p>
                            ) : null}
                          </div>
                          {option.exists ? (
                            <button
                              type="button"
                              className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClass}`}
                              onClick={() => option.template?.id ? setSelectedTemplateId(option.template.id) : null}
                              title={option.routable ? 'This route can be selected during mandate generation.' : 'Open this route template to finish setup or publish it.'}
                            >
                              {readiness.label}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={studioQuietButtonClass}
                              disabled={!canEdit || creatingMandateVariants}
                              onClick={() => void handleCreateMandateVariantTemplate(option.key)}
                            >
                              <Plus size={14} />
                              <span>Create</span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-5 rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Governance</p>
                    <h3 className="mt-2 text-base font-semibold text-[#102033]">Live Review & Section Locks</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                      Lock approved wording before publishing so future edits have a clear governance signal.
                    </p>
                  </div>
                  <span className={[
                    'rounded-full border px-3 py-1.5 text-xs font-semibold',
                    canPublishTemplate ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]' : 'border-[#f3d1ce] bg-[#fff4f3] text-[#8e1f15]',
                  ].join(' ')}
                  >
                    {canPublishTemplate ? 'Can publish' : 'Review only'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    { label: 'Changed sections', value: publishReview.changedSectionCount },
                    { label: 'Locked sections', value: publishReview.lockedSectionCount },
                    { label: 'Signing fields', value: publishReview.signingFieldCount },
                    { label: 'Conditional clauses', value: publishReview.conditionCount },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[16px] border border-[#dbe7f3] bg-white px-4 py-3">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-[#102033]">{item.value}</p>
                    </div>
                  ))}
                </div>

                {conditionalMasterCoverageReadiness ? (
                  <div className={[
                    'mt-4 rounded-[18px] border px-4 py-3',
                    conditionalMasterCoverageReadiness.ready
                      ? 'border-[#cdebd8] bg-[#eef9f1]'
                      : 'border-[#f3d1ce] bg-[#fff4f3]',
                  ].join(' ')}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Coverage Readiness</p>
                        <p className="mt-1 text-sm font-semibold text-[#102033]">
                          {conditionalMasterCoverageReadiness.coveredCaseCount}/{conditionalMasterCoverageReadiness.caseCount} supported legal cases covered
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                          One conditional master is checked across every supported party, property and finance combination.
                        </p>
                      </div>
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                        conditionalMasterCoverageReadiness.ready
                          ? 'border-[#b8e5c7] bg-white text-[#128642]'
                          : 'border-[#e9b7b2] bg-white text-[#8e1f15]',
                      ].join(' ')}
                      >
                        {conditionalMasterCoverageReadiness.ready ? 'Coverage ready' : 'Coverage blocked'}
                      </span>
                    </div>
                    {conditionalMasterCoverageReadiness.issues.length ? (
                      <div className="mt-3 space-y-2">
                        {conditionalMasterCoverageReadiness.issues.slice(0, 3).map((item) => (
                          <p key={`${item.code}-${item.sectionKey}`} className="text-sm leading-6 text-[#8e1f15]">{item.message}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[#52667d]">
                        All protected wording packs and signer rules agree with the canonical scenario resolver.
                      </p>
                    )}
                  </div>
                ) : null}

                {packetType === 'mandate' && mandatePublishGateReport ? (
                  <div className={[
                    'mt-4 rounded-[18px] border px-4 py-3',
                    mandatePublishGateReport.isValidForPublish
                      ? 'border-[#cdebd8] bg-[#eef9f1]'
                      : 'border-[#f3d1ce] bg-[#fff4f3]',
                  ].join(' ')}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">Mandate Content Gate</p>
                        <p className="mt-1 text-sm font-semibold text-[#102033]">
                          {mandatePublishGateReport.routeLabel}: {mandatePublishGateReport.isValidForPublish ? 'Ready for publish review' : `${mandatePublishGateReport.blockingCount} blocker${mandatePublishGateReport.blockingCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                        mandatePublishGateReport.isValidForPublish
                          ? 'border-[#b8e5c7] bg-white text-[#128642]'
                          : 'border-[#e9b7b2] bg-white text-[#8e1f15]',
                      ].join(' ')}
                      >
                        {mandatePublishGateReport.gateVersion}
                      </span>
                    </div>
                    {mandatePublishGateReport.blockingMessages.length ? (
                      <div className="mt-3 space-y-2">
                        {mandatePublishGateReport.blockingMessages.slice(0, 3).map((item) => (
                          <p key={`mandate-content-gate-${item}`} className="text-sm leading-6 text-[#8e1f15]">{item}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-[#52667d]">
                        No route-content blockers detected for this mandate template.
                      </p>
                    )}
                  </div>
                ) : null}

                <div className="mt-4 space-y-2">
                  {(form.sections || []).map((section, index) => {
                    const governance = getSectionGovernance(section)
                    return (
                      <div key={`${section.sectionKey || index}-governance`} className="flex flex-col gap-3 rounded-[16px] border border-[#dbe7f3] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#102033]">{getFriendlySectionLabel(section, index)}</p>
                          <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                            {governance.locked
                              ? `Locked for ${governance.lockedByRole || 'principal'} review${governance.lockReason ? `: ${governance.lockReason}` : ''}`
                              : 'Unlocked wording'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={[
                            'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                            governance.locked ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]' : 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]',
                          ].join(' ')}
                          >
                            {governance.locked ? 'Locked' : 'Open'}
                          </span>
                          <button
                            type="button"
                            className={studioQuietButtonClass}
                            disabled={!canPublishTemplate || !selectedIsOrgOwned}
                            onClick={() => updateSectionGovernance(index, {
                              locked: !governance.locked,
                              locked_by_role: !governance.locked ? 'principal' : null,
                              lockReason: !governance.locked ? 'Approved wording' : '',
                            })}
                          >
                            <ShieldCheck size={14} />
                            <span>{governance.locked ? 'Unlock' : 'Lock'}</span>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Generation"
                title="Output & Storage"
                description="Keep the existing generation mode and file paths intact while making changes to this version."
              >
                <div className={settingsGridClass}>
                  <label className={settingsFieldClass}>
                    Generation mode
                    <select
                      value={form.renderMode}
                      disabled={!canEdit || !selectedIsOrgOwned}
                      onChange={(event) => setForm((previous) => {
                        const nextRenderMode = event.target.value
                        return {
                          ...previous,
                          renderMode: nextRenderMode,
                          templateFormat: getTemplateFormatForMode(nextRenderMode),
                        }
                      })}
                    >
                      {TEMPLATE_RENDER_MODE_OPTIONS
                        .filter((item) => packetType === 'mandate' || packetType.startsWith('commercial_') || item.key === TEMPLATE_RENDER_MODES.LEGACY_DOCX)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.key === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Built in app' : 'File based (DOCX)'}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className={settingsFieldClass}>
                    Output type
                    <input type="text" value={form.templateFormat} disabled readOnly />
                  </label>

                  <label className={settingsFieldClass}>
                    Output bucket
                    <input
                      type="text"
                      value={form.templateOutputBucket}
                      disabled={!canEdit || !selectedIsOrgOwned}
                      onChange={(event) => setForm((previous) => ({ ...previous, templateOutputBucket: event.target.value }))}
                    />
                  </label>
                </div>

                {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? (
                  <div className="mt-4">
                    <SettingsBanner tone={validationSummary.renderable ? 'success' : 'warning'}>
                      {validationSummary.renderable
                        ? 'This in-app template is ready to use. No DOCX file is needed.'
                        : 'This in-app template can still be saved, but you may want to review warnings before publishing.'}
                    </SettingsBanner>
                  </div>
                ) : null}

                <div className="mt-5 rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#102033]">
                        {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'In-app rendering' : 'DOCX source file'}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                        {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                          ? 'This version is built from sections and merge fields inside the app.'
                          : 'This version depends on an uploaded DOCX file path and bucket.'}
                      </p>
                    </div>

                    {form.renderMode === TEMPLATE_RENDER_MODES.LEGACY_DOCX && canEdit && selectedIsOrgOwned ? (
                      <label className={`${studioSecondaryButtonClass} cursor-pointer`}>
                        <Upload size={14} />
                        <span>{uploadingTemplate ? 'Uploading…' : 'Upload DOCX'}</span>
                        <input
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(event) => void handleUploadTemplateFile(event)}
                          disabled={uploadingTemplate}
                        />
                      </label>
                    ) : null}
                  </div>

                  {form.renderMode === TEMPLATE_RENDER_MODES.LEGACY_DOCX ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className={settingsFieldClass}>
                        Storage bucket
                        <input
                          type="text"
                          value={form.templateStorageBucket}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateStorageBucket: event.target.value }))}
                        />
                      </label>

                      <label className={settingsFieldClass}>
                        File name
                        <input
                          type="text"
                          value={form.templateFileName}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateFileName: event.target.value }))}
                        />
                      </label>

                      <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                        Storage path
                        <input
                          type="text"
                          value={form.templateStoragePath}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateStoragePath: event.target.value }))}
                          placeholder="legal-templates/{organisation}/{packetType}/template.docx"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </TemplateStudioPanel>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={studioSecondaryButtonClass} onClick={() => openTemplatePreview()} disabled={testingTemplate}>
                  <Eye size={14} />
                  <span>{testingTemplate ? 'Previewing...' : 'Preview'}</span>
                </button>
                <button
                  type="submit"
                  className={studioPrimaryButtonClass}
                  disabled={!canEdit || saving || cloning}
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving…' : 'Save Template'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to edit metadata and generation settings."
          />
        )
      ) : null}

      {activeStudioArea === 'templates' && activeTab === 'preview' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <TemplateStudioPanel
              eyebrow="Preview"
              title="Document Preview"
              description="Preview the current template with safe sample details. Linked-record testing and draft creation live in Documents."
              actions={
                <button
                  type="button"
                  className={studioPrimaryButtonClass}
                  onClick={() => void handleTestGenerate()}
                  disabled={testingTemplate}
                >
                  <Eye size={14} />
                  <span>{testingTemplate ? 'Previewing...' : 'Refresh preview'}</span>
                </button>
              }
            >
              <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f6f8fb] p-3 sm:p-5" data-testid="sample-preview-stage">
                <div className="flex min-h-[560px] items-start justify-center overflow-auto rounded-[16px] border border-[#e2eaf3] bg-[#eef3f8] p-3 sm:p-6">
                  <div className="w-full max-w-[760px] rounded-[10px] border border-[#e2eaf3] bg-white px-5 py-6 shadow-[0_18px_34px_rgba(15,23,42,0.10)] sm:px-10 sm:py-12" data-testid="sample-preview-page">
                    {previewState.loading ? (
                      <SettingsLoadingState compact label="Preparing document preview…" />
                    ) : previewState.error ? (
                      <SettingsBanner tone="error">{previewState.error}</SettingsBanner>
                    ) : previewState.html ? (
                      <div className="space-y-4 text-sm leading-6 text-[#233246]">
                        <div dangerouslySetInnerHTML={{ __html: previewState.html }} />
                      </div>
                    ) : (
                      <SettingsEmptyState
                        title="No preview generated yet"
                        description="Run a preview to inspect the current template layout without affecting live transactions."
                        action={(
                          <button
                            type="button"
                            className={studioPrimaryButtonClass}
                            onClick={() => void handleTestGenerate()}
                            disabled={testingTemplate}
                            aria-label="Generate sample preview"
                          >
                            <Eye size={14} />
                            <span>{testingTemplate ? 'Preparing preview...' : 'Generate sample preview'}</span>
                          </button>
                        )}
                      />
                    )}
                  </div>
                </div>
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <SamplePreviewSupportPanel
                previewState={previewState}
                validationSummary={validationSummary}
                previewReadinessIssueCount={previewReadinessIssueCount}
                setActiveStudioArea={setActiveStudioArea}
              />
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template before running test generation and preview."
          />
        )
      ) : null}

      {activeStudioArea === 'templates' && activeTab === 'activity' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <TemplateStudioPanel
              eyebrow="Version History"
              title="Template Versions"
              description="Available versions for this document type, with the current selection highlighted."
            >
              <div className="space-y-3">
                {selectedList.map((template) => {
                  const status = normalizeTemplateStatus(template)
                  const classification = classifyTemplateMigrationState(template, packetType)
                  const active = template.id === selectedTemplateId
                  return (
                    <div
                      key={template.id}
                      className={[
                        'rounded-[20px] border p-4',
                        active ? 'border-[#bcd6ff] bg-[#eef5ff]' : 'border-[#dbe7f3] bg-white',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[#102033]">{template.template_label || template.template_key}</p>
                          <p className="text-sm text-[#6b7c93]">{template.description || 'No description yet.'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {template.is_default ? <TemplateStatusPill status="active">Default</TemplateStatusPill> : null}
                          <TemplateStatusPill status={status}>{TEMPLATE_STATUS_OPTIONS.find((item) => item.key === status)?.label || 'Draft'}</TemplateStatusPill>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-[#445b73] md:grid-cols-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Version</p>
                          <p className="mt-1">{template.version_tag || 'v1'}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Generation</p>
                          <p className="mt-1">{formatRenderModeLabel(classification.renderMode)}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Updated</p>
                          <p className="mt-1">{formatDateTime(template.updated_at)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Current Activity"
                title="Live Version Activity"
                description="Live status and recent template timestamps from the current record."
              >
                <div className="space-y-3">
                  {activityItems.length ? activityItems.map((item) => (
                    <div key={item.key} className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#102033]">{item.title}</p>
                        <span className="inline-flex items-center gap-1 text-xs text-[#7a8da6]">
                          <Clock3 size={12} />
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#6b7c93]">{item.detail}</p>
                    </div>
                  )) : (
                    <p className="text-sm leading-6 text-[#6b7c93]">Activity will appear here as template timestamps become available.</p>
                  )}
                </div>
              </TemplateStudioPanel>

              <TemplateStudioPanel
                eyebrow="Publishing"
                title="Live Template"
                description="The version new documents currently use."
              >
                {liveTemplate ? (
                  <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <p className="text-base font-semibold text-[#102033]">{liveTemplate.template_label || liveTemplate.template_key}</p>
                    <p className="mt-2 text-sm text-[#6b7c93]">{liveTemplate.version_tag || 'v1'} · {formatDateTime(liveTemplate.updated_at)}</p>
                    <p className="mt-2 text-sm text-[#6b7c93]">Published by: {getTemplateActorLabel(liveTemplate)}</p>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#6b7c93]">No live default template is active yet for this document type.</p>
                )}
              </TemplateStudioPanel>
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to review versions and live status."
          />
        )
      ) : null}

      {activeStudioArea === 'clauseLibrary' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <TemplateStudioPanel
            eyebrow="Clause Library"
            title="Approved Clause Library"
            description="Reusable approved wording that can be inserted directly into the selected document section."
            actions={
              <button type="button" className={studioPrimaryButtonClass} onClick={() => setActiveStudioArea('templates')}>
                <Plus size={14} />
                <span>Open Builder</span>
              </button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              {clauseLibraryItems.map((item) => (
                <article key={item.key} className="rounded-[20px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-white text-[#128642]">
                      <Layers3 size={18} />
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      {item.locked ? (
                        <span className="rounded-full border border-[#cdebd8] bg-[#eef9f1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#128642]">
                          Locked
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[#dbe7f3] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">{item.category}</p>
                  <h3 className="mt-4 text-base font-semibold text-[#102033]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#607387]">{item.description}</p>
                  <div className="mt-4 rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-3 text-sm leading-6 text-[#233246]">
                    {renderTemplateEditorInline(item.snippet, tokenLabelByKey)}
                  </div>
                  {item.tokenLabels.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tokenLabels.map((label, index) => (
                        <span key={`${item.key}-token-${index}`} className="rounded-full bg-[#eef9f1] px-2 py-1 text-[11px] font-semibold text-[#128642]">
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs font-semibold text-[#6f7f95]">
                    Suggested rule: {describeConditionRule(item.defaultCondition, tokenLabelByKey)}
                  </p>
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#128642] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(18,134,66,0.18)] transition hover:bg-[#0f7438] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleInsertClauseFromLibrary(item)}
                    disabled={!selectedSection || !canEdit}
                  >
                    <Plus size={14} />
                    <span>Insert into selected section</span>
                  </button>
                </article>
              ))}
            </div>
          </TemplateStudioPanel>

          <div className="space-y-6">
            <TemplateStudioPanel
              eyebrow="Standard Conditions"
              title={`${legalConditionCoverage.percent}% Covered`}
              description="Coverage is read from the current template sections, so edited-down templates stay honest."
            >
              <div className="space-y-2">
                {legalConditionCoverage.items.map((item) => (
                  <button
                    key={`library-coverage-${item.key}`}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#96d7ad] hover:bg-[#f6fbf8] disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={() => {
                      if (item.firstSectionIndex !== null) {
                        setSelectedSectionIndex(item.firstSectionIndex)
                        setActiveStudioArea('templates')
                      }
                    }}
                    disabled={item.firstSectionIndex === null}
                  >
                    {item.covered ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#128642]" />
                    ) : (
                      <CircleDot size={15} className="mt-0.5 shrink-0 text-[#9fb0c4]" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#102033]">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#607387]">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </TemplateStudioPanel>

            <TemplateStudioPanel
              eyebrow="Governance"
              title="Library Controls"
              description="The library will become the source of truth for approved wording."
            >
              <div className="space-y-3">
                {[
                  'Approved clause cards now insert into Build',
                  'Locked clauses are visually marked for governance',
                  'Suggested conditions can be applied with the clause',
                  'Variable chips show readable field names',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm font-semibold text-[#102033]">
                    <CheckCircle2 size={16} className="text-[#128642]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </TemplateStudioPanel>

            <TemplateStudioPanel
              eyebrow="Next Step"
              title="Using Clauses"
              description="Choose a target section in Build first, then insert approved wording from this library."
            >
              <button type="button" className={studioSecondaryButtonClass} onClick={() => setActiveStudioArea('templates')}>
                <FileText size={14} />
                <span>Back to Templates</span>
              </button>
            </TemplateStudioPanel>
          </div>
        </div>
      ) : null}

      {activeStudioArea === 'documents' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <TemplateStudioPanel
            eyebrow="Documents"
            title="Document Library"
            description="Drafts, generated documents, signing prep, and linked exports for this document type."
            actions={
              <>
                <button
                  type="button"
                  className={studioSecondaryButtonClass}
                  onClick={() => {
                    setActiveStudioArea('templates')
                    setActiveTab('template')
                    setTemplateStarterMenuOpen(true)
                  }}
                  disabled={!canEdit || saving || cloning || creatingTemplate}
                >
                  <FileText size={14} />
                  <span>New Template</span>
                </button>
                <button
                  type="button"
                  className={studioPrimaryButtonClass}
                  onClick={openDocumentLibraryStart}
                  disabled={creatingDocumentPacket || !selectedTemplate || hasUnsavedChanges}
                >
                  <Plus size={14} />
                  <span>{creatingDocumentPacket ? 'Creating...' : 'Create Document'}</span>
                </button>
              </>
            }
          >
            <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-3">
                {generatedDocumentRows.map((item) => (
                  <article key={item.key} className="rounded-[20px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{item.title}</p>
                    <p className="mt-3 text-[1.6rem] font-semibold text-[#102033]">{item.value}</p>
                    <p className="mt-2 text-sm leading-6 text-[#607387]">{item.detail}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Recent Documents</p>
                    <h3 className="mt-2 text-base font-semibold text-[#102033]">{templateTypeConfig.label} library</h3>
                  </div>
                  <button
                    type="button"
                    className={studioQuietButtonClass}
                    onClick={() => void loadDocumentLibrary({ targetPacketType: packetType })}
                    disabled={documentPacketsLoading}
                  >
                    <Clock3 size={14} />
                    <span>{documentPacketsLoading ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {documentPacketsLoading ? (
                  <div className="mt-5">
                    <SettingsLoadingState compact label="Loading documents…" />
                  </div>
                ) : documentPackets.length ? (
                  <div className="mt-5 space-y-3">
                    {documentPackets.map((packet) => {
                      const packetStatus = normalizeText(packet?.status).toLowerCase() || 'draft'
                      const sourceContext = packet?.source_context_json && typeof packet.source_context_json === 'object'
                        ? packet.source_context_json
                        : {}
                      const selected = packet.id === selectedLibraryPacketId
                      const packetActionPending = packetActionId.endsWith(`:${packet.id}`)
                      const canGeneratePacket = !['archived', 'voided', 'completed', 'sent', 'partially_signed'].includes(packetStatus)
                      const canArchivePacket = !['archived', 'voided'].includes(packetStatus)
                      const linkedReference = normalizeText(packet?.transaction_id)
                        ? `Transaction ${String(packet.transaction_id).slice(0, 8)}`
                        : normalizeText(packet?.lead_id)
                          ? `Lead ${String(packet.lead_id).slice(0, 8)}`
                          : normalizeText(sourceContext.transactionId || sourceContext.leadId || sourceContext.dealId || sourceContext.unitId)
                            ? 'Linked details'
                            : 'Manual details'
                      const documentKindLabel = normalizeText(sourceContext.documentKindLabel || sourceContext.document_kind_label)
                        || getDocumentKindOption(sourceContext.documentKind || sourceContext.document_kind).label
                      const addendumReview = buildAddendumDocumentReviewSummary(sourceContext)
                      const packetRelationship = documentPacketRelationshipMap.get(normalizeText(packet.id))
                      const linkedAddendumCount = packetRelationship?.relatedAddendums?.length || 0
                      return (
                        <article
                          key={packet.id}
                          className={`rounded-[18px] border bg-white p-4 transition ${
                            selected
                              ? 'border-[#96d7ad] shadow-[0_14px_28px_rgba(18,134,66,0.10)]'
                              : 'border-[#dbe7f3] hover:border-[#bfd5f5]'
                          }`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#102033]">{packet.title || packet.template_label_snapshot || 'Untitled document'}</p>
                              <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                                {documentKindLabel} · {packet.template_label_snapshot || selectedTemplate?.template_label || 'Template'} · {linkedReference}
                              </p>
                              {addendumReview.visible || linkedAddendumCount ? (
                                <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                                  {addendumReview.visible ? (
                                    <>
                                      <span className="max-w-full truncate rounded-full border border-[#cdebd8] bg-[#eef9f1] px-2.5 py-1 text-[0.68rem] font-semibold text-[#128642]">
                                        {addendumReview.label}
                                      </span>
                                      <span className="max-w-full truncate rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                                        Original: {addendumReview.referenceLabel}
                                      </span>
                                    </>
                                  ) : null}
                                  {linkedAddendumCount ? (
                                    <span className="max-w-full truncate rounded-full border border-[#bcd6ff] bg-[#eef5ff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#0a66ff]">
                                      {linkedAddendumCount} addendum{linkedAddendumCount === 1 ? '' : 's'} linked
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <TemplateStatusPill status={packetStatus}>{packetStatus.replace(/_/g, ' ')}</TemplateStatusPill>
                          </div>
                          <div className="mt-4 grid gap-3 text-xs text-[#607387] md:grid-cols-3">
                            <div>
                              <p className="font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Created</p>
                              <p className="mt-1">{formatDateTime(packet.created_at)}</p>
                            </div>
                            <div>
                              <p className="font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Updated</p>
                              <p className="mt-1">{formatDateTime(packet.updated_at)}</p>
                            </div>
                            <div>
                              <p className="font-semibold uppercase tracking-[0.12em] text-[#8aa0b8]">Version</p>
                              <p className="mt-1">v{packet.current_version_number || 0}</p>
                            </div>
                          </div>
                          {addendumReview.visible && (addendumReview.documentChangeSummary || addendumReview.detailItems.length) ? (
                            <div className="mt-4 rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3 text-xs leading-5 text-[#607387]">
                              {addendumReview.documentChangeSummary ? (
                                <p className="break-words">
                                  <span className="font-semibold text-[#35546c]">Change:</span> {addendumReview.documentChangeSummary}
                                </p>
                              ) : null}
                              {addendumReview.detailItems.length ? (
                                <p className="mt-1 font-semibold text-[#35546c]">
                                  {addendumReview.detailItems.length} captured detail{addendumReview.detailItems.length === 1 ? '' : 's'}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={studioQuietButtonClass}
                              onClick={() => setSelectedLibraryPacketId(packet.id)}
                            >
                              <Eye size={14} />
                              <span>{selected ? 'Selected' : 'Inspect'}</span>
                            </button>
                            <button
                              type="button"
                              className={studioQuietButtonClass}
                              onClick={() => void handlePreviewLibraryPacket(packet)}
                              disabled={packetActionPending}
                            >
                              <FlaskConical size={14} />
                              <span>Preview</span>
                            </button>
                            <button
                              type="button"
                              className={studioSecondaryButtonClass}
                              onClick={() => void handleGenerateLibraryPacket(packet)}
                              disabled={packetActionPending || !canGeneratePacket}
                            >
                              <FileSignature size={14} />
                              <span>{packet.current_version_number ? 'Regenerate' : 'Generate'}</span>
                            </button>
                            <button
                              type="button"
                              className={studioSecondaryButtonClass}
                              onClick={() => handleStartAddendumFromLibraryPacket(packet)}
                              disabled={packetActionPending}
                              title={defaultAddendumTemplate ? 'Start an addendum from this document' : 'Create a General Addendum template first'}
                            >
                              <CopyPlus size={14} />
                              <span>Add Addendum</span>
                            </button>
                            <button
                              type="button"
                              className={studioDangerButtonClass}
                              onClick={() => void handleArchiveLibraryPacket(packet)}
                              disabled={packetActionPending || !canArchivePacket}
                            >
                              <Trash2 size={14} />
                              <span>Archive</span>
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <SettingsEmptyState
                    title="No generated documents yet"
                    description="Create a draft document from Preview or Documents to start the library for this template type."
                  />
                )}
              </div>
            </div>
          </TemplateStudioPanel>

          <div className="space-y-6">
            <DocumentCreationPanel
              documentRunForm={documentRunForm}
              setDocumentRunForm={setDocumentRunForm}
              packetType={packetType}
              form={form}
              selectedTemplate={selectedTemplate}
              templateTypeConfig={templateTypeConfig}
              hasUnsavedChanges={hasUnsavedChanges}
              testingTemplate={testingTemplate}
              creatingDocumentPacket={creatingDocumentPacket}
              setActiveStudioArea={setActiveStudioArea}
              setActiveTab={setActiveTab}
              createDefaultDocumentRunForm={createDefaultDocumentRunForm}
              addendumDetailOptions={ADDENDUM_DOCUMENT_DETAIL_OPTIONS}
              documentLinkOptions={documentLinkOptions}
              documentLinkOptionsLoading={documentLinkOptionsLoading}
              documentLinkOptionsError={documentLinkOptionsError}
              onRefreshDocumentLinkOptions={loadDocumentLinkOptions}
              handleTestGenerateFromRun={handleTestGenerateFromRun}
              handleCreateDocumentPacketFromRun={handleCreateDocumentPacketFromRun}
            />

            <TemplateCreationPanel
              canEdit={canEdit}
              cloning={cloning}
              saving={saving}
              handleCreateTemplate={handleCreateTemplate}
              handleCreateGeneralAddendumTemplate={handleCreateGeneralAddendumTemplate}
              handleCreateAddendumStarterTemplate={handleCreateAddendumStarterTemplate}
              addendumTemplateStarters={ADDENDUM_TEMPLATE_STARTER_OPTIONS}
              setActiveStudioArea={setActiveStudioArea}
              setActiveTab={setActiveTab}
            />

            <TemplateStudioPanel
              eyebrow="Document Workspace"
              title={selectedLibraryPacket ? selectedLibraryPacket.title || selectedLibraryPacket.template_label_snapshot || 'Selected document' : 'No document selected'}
              description={selectedLibraryPacket ? 'Inspect versions, file links, linked details, and workflow history.' : 'Select a document from the library to inspect and manage it.'}
            >
              {packetDetailLoading ? (
                <SettingsLoadingState compact label="Loading document workspace…" />
              ) : selectedLibraryPacket ? (
                <div className="space-y-5">
                  <div className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102033]">{selectedLibraryPacket.template_label_snapshot || selectedTemplate?.template_label || 'Template'}</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                          {selectedLibraryPacketDocumentKindLabel} · Updated {formatDateTime(selectedLibraryPacket.updated_at)}
                        </p>
                      </div>
                      <TemplateStatusPill status={normalizeText(selectedLibraryPacket.status).toLowerCase() || 'draft'}>
                        {normalizeText(selectedLibraryPacket.status).replace(/_/g, ' ') || 'draft'}
                      </TemplateStatusPill>
                    </div>

                    <div className="mt-4 grid gap-3 text-xs text-[#607387]">
                      {[
                        { label: 'Transaction', value: selectedLibraryPacket.transaction_id, missing: 'Not linked', truncate: true },
                        { label: 'Lead', value: selectedLibraryPacket.lead_id, missing: 'Not linked', truncate: true },
                        { label: 'Deal', value: selectedLibraryPacket.deal_id, missing: 'Not linked', truncate: true },
                        { label: 'Unit', value: selectedLibraryPacket.unit_id, missing: 'Not linked', truncate: true },
                        { label: 'Document kind', value: selectedLibraryPacketDocumentKindLabel, missing: 'Standard document', truncate: false },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e8eff7] bg-white px-3 py-2">
                          <span className="font-semibold text-[#35546c]">{item.label}</span>
                          <span className="truncate text-right">{normalizeText(item.value) ? (item.truncate ? String(item.value).slice(0, 12) : String(item.value)) : item.missing}</span>
                        </div>
                      ))}
                    </div>

                    {selectedLibraryPacketAddendumReview.visible ? (
                      <div className="mt-4 rounded-[16px] border border-[#d6efe1] bg-[#f5fbf8] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#102033]">Related Document</p>
                            <p className="mt-1 text-xs leading-5 text-[#607387]">
                              {selectedLibraryPacketAddendumReview.label} linked to {selectedLibraryPacketAddendumReview.referenceLabel}.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#cdebd8] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#128642]">
                            {selectedLibraryPacketAddendumReview.documentKind.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 text-xs text-[#607387]">
                          {[
                            { label: 'Original reference', value: selectedLibraryPacketAddendumReview.parentDocumentReference || selectedLibraryPacketAddendumReview.parentDocumentId || 'Not linked yet' },
                            { label: 'Change summary', value: selectedLibraryPacketAddendumReview.documentChangeSummary || 'Not captured' },
                          ].map((item) => (
                            <div key={item.label} className="rounded-[14px] border border-[#d6efe1] bg-white px-3 py-3">
                              <p className="font-semibold uppercase tracking-[0.12em] text-[#5a8d6d]">{item.label}</p>
                              <p className="mt-1 break-words text-[#35546c]">{item.value}</p>
                            </div>
                          ))}
                        </div>

                        {selectedLibraryPacketAddendumReview.detailItems.length ? (
                          <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
                            {selectedLibraryPacketAddendumReview.detailItems.map((item) => (
                              <div key={item.key} className="min-w-0 rounded-[14px] border border-[#d6efe1] bg-white px-3 py-3">
                                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#5a8d6d]">{item.label}</p>
                                <p className="mt-1 break-words text-sm leading-6 text-[#35546c]">{item.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 rounded-[14px] border border-[#d6efe1] bg-white px-3 py-3 text-sm leading-6 text-[#607387]">
                            No guided addendum values were captured for this document.
                          </p>
                        )}
                      </div>
                    ) : null}

                    {(selectedLibraryPacketRelationship?.parentPacket || selectedLibraryPacketRelationship?.relatedAddendums?.length) ? (
                      <div className="mt-4 rounded-[16px] border border-[#dbe7f3] bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#102033]">Document Chain</p>
                            <p className="mt-1 text-xs leading-5 text-[#607387]">
                              Jump between the original document and addendums linked to it.
                            </p>
                          </div>
                          <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                            {(selectedLibraryPacketRelationship?.relatedAddendums || []).length} linked
                          </span>
                        </div>

                        <div className="mt-4 space-y-2">
                          {selectedLibraryPacketRelationship?.parentPacket ? (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#102033]">
                                  {selectedLibraryPacketRelationship.parentPacket.title || selectedLibraryPacketRelationship.parentPacket.template_label_snapshot || 'Original document'}
                                </p>
                                <p className="mt-1 text-xs text-[#6b7c93]">Original document</p>
                              </div>
                              <button
                                type="button"
                                className={studioQuietButtonClass}
                                onClick={() => setSelectedLibraryPacketId(selectedLibraryPacketRelationship.parentPacket.id)}
                              >
                                <Eye size={14} />
                                <span>Inspect</span>
                              </button>
                            </div>
                          ) : null}

                          {(selectedLibraryPacketRelationship?.relatedAddendums || []).map(({ packet, review }) => (
                            <div key={packet.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#102033]">{packet.title || packet.template_label_snapshot || 'Linked addendum'}</p>
                                <p className="mt-1 text-xs text-[#6b7c93]">{review.label}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <TemplateStatusPill status={normalizeText(packet.status).toLowerCase() || 'draft'}>
                                  {normalizeText(packet.status).replace(/_/g, ' ') || 'draft'}
                                </TemplateStatusPill>
                                <button
                                  type="button"
                                  className={studioQuietButtonClass}
                                  onClick={() => setSelectedLibraryPacketId(packet.id)}
                                >
                                  <Eye size={14} />
                                  <span>Inspect</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => void handlePreviewLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId)}
                      >
                        <Eye size={14} />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        className={studioPrimaryButtonClass}
                        onClick={() => void handleGenerateLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId) || ['archived', 'voided', 'completed', 'sent', 'partially_signed'].includes(normalizeText(selectedLibraryPacket.status).toLowerCase())}
                      >
                        <FileSignature size={14} />
                        <span>{packetActionId.startsWith('generate:') ? 'Generating...' : latestLibraryPacketVersion ? 'Regenerate' : 'Generate'}</span>
                      </button>
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => handleStartAddendumFromLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId)}
                        title={defaultAddendumTemplate ? 'Start an addendum from this document' : 'Create a General Addendum template first'}
                      >
                        <CopyPlus size={14} />
                        <span>Add Addendum</span>
                      </button>
                      {latestLibraryPacketArtifactUrl ? (
                        <a
                          className={studioQuietButtonClass}
                          href={latestLibraryPacketArtifactUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Upload size={14} />
                          <span>{getPacketVersionArtifactLabel(latestLibraryPacketVersion)}</span>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => void handlePrepareSigningForLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId) || !latestGeneratedLibraryPacketVersion}
                      >
                        <FileSignature size={14} />
                        <span>{packetActionId.startsWith('signing-prep:') ? 'Preparing...' : 'Prepare Signing'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102033]">Versions</p>
                      <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                        {selectedLibraryPacketVersions.length}
                      </span>
                    </div>
                    {selectedLibraryPacketVersions.length ? (
                      <div className="mt-3 space-y-2">
                        {selectedLibraryPacketVersions.slice(0, 5).map((version) => {
                          const artifactUrl = getPacketVersionArtifactUrl(version)
                          return (
                            <div key={version.id} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-[#102033]">v{version.version_number}</p>
                                <TemplateStatusPill status={normalizeText(version.render_status).toLowerCase() || 'draft'}>
                                  {normalizeText(version.render_status) || 'draft'}
                                </TemplateStatusPill>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-[#6b7c93]">{formatDateTime(version.generated_at || version.created_at)}</p>
                              {artifactUrl ? (
                                <a className="mt-2 inline-flex text-xs font-semibold text-[#0a66ff]" href={artifactUrl} target="_blank" rel="noreferrer">
                                  {getPacketVersionArtifactLabel(version)}
                                </a>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-[#6b7c93]">No generated versions yet.</p>
                    )}
                  </div>

                  <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102033]">Signing Prep</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                          Prepare signers and fields from the generated version, then create secure signing links.
                        </p>
                      </div>
                      <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#607387]">
                        {latestGeneratedLibraryPacketVersion ? `v${latestGeneratedLibraryPacketVersion.version_number}` : 'Generate first'}
                      </span>
                    </div>

                    {signingSummaryLoading ? (
                      <div className="mt-4">
                        <SettingsLoadingState compact label="Loading signing prep…" />
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        {[
                          { label: 'Signers', value: selectedPacketSigningSummary?.signerCount || 0 },
                          { label: 'Fields', value: selectedPacketSigningSummary?.fieldCount || 0 },
                          { label: 'Required done', value: `${selectedPacketSigningSummary?.completedRequiredFieldCount || 0}/${selectedPacketSigningSummary?.requiredFieldCount || 0}` },
                        ].map((item) => (
                          <div key={item.label} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                            <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">{item.label}</p>
                            <p className="mt-2 text-lg font-semibold text-[#102033]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => void handlePrepareSigningForLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId) || !latestGeneratedLibraryPacketVersion}
                      >
                        <FileSignature size={14} />
                        <span>{packetActionId.startsWith('signing-prep:') ? 'Preparing...' : 'Prepare Fields'}</span>
                      </button>
                      <button
                        type="button"
                        className={studioPrimaryButtonClass}
                        onClick={() => void handleGenerateSigningLinksForLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId) || !latestGeneratedLibraryPacketVersion || !(selectedPacketSigningSummary?.signerCount)}
                      >
                        <Upload size={14} />
                        <span>{packetActionId.startsWith('signing-links:') ? 'Sending...' : 'Send / Generate Links'}</span>
                      </button>
                    </div>

                    {Array.isArray(selectedPacketSigningSummary?.signers) && selectedPacketSigningSummary.signers.length ? (
                      <div className="mt-4 space-y-2">
                        {selectedPacketSigningSummary.signers.map((signer) => {
                          const resultLink = normalizeText((signingLinksResult?.signers || []).find((item) => normalizeText(item?.id) === normalizeText(signer.id))?.signing_link)
                          const tokenLink = normalizeText(signer.signing_token)
                            ? `${typeof window !== 'undefined' ? window.location.origin : ''}/sign/${signer.signing_token}`
                            : ''
                          const generatedLink = resultLink || tokenLink
                          return (
                            <div key={signer.id} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#102033]">{signer.signer_name || getSignerRoleLabel(signer.signer_role)}</p>
                                  <p className="mt-1 truncate text-xs text-[#6b7c93]">{signer.signer_email || 'No email'}</p>
                                </div>
                                <TemplateStatusPill status={normalizeText(signer.status).toLowerCase() || 'pending'}>
                                  {normalizeText(signer.status) || 'pending'}
                                </TemplateStatusPill>
                              </div>
                              {generatedLink ? (
                                <a className="mt-2 inline-flex text-xs font-semibold text-[#0a66ff]" href={generatedLink} target="_blank" rel="noreferrer">
                                  Open signing link
                                </a>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-[#6b7c93]">
                        No signers prepared yet. Generate the document, then prepare signing fields.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102033]">Final Signed Record</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                          Generate the immutable final copy after all required signers and fields are complete.
                        </p>
                      </div>
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                        latestFinalLibraryPacketArtifactUrl
                          ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]'
                          : canGenerateFinalLibraryPacket
                            ? 'border-[#bcd6ff] bg-[#eef5ff] text-[#0a66ff]'
                            : 'border-[#f4e2bf] bg-[#fff8ec] text-[#7d520d]',
                      ].join(' ')}
                      >
                        {latestFinalLibraryPacketArtifactUrl ? 'Final ready' : canGenerateFinalLibraryPacket ? 'Ready' : 'Waiting'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[
                        { label: 'Signed', value: `${completedLibrarySignersCount}/${selectedPacketSigningSummary?.signerCount || 0}` },
                        { label: 'Required fields', value: `${selectedPacketSigningSummary?.completedRequiredFieldCount || 0}/${selectedPacketSigningSummary?.requiredFieldCount || 0}` },
                        { label: 'Final version', value: latestFinalLibraryPacketVersion ? `v${latestFinalLibraryPacketVersion.version_number}` : 'None' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">{item.label}</p>
                          <p className="mt-2 text-lg font-semibold text-[#102033]">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {!canGenerateFinalLibraryPacket && !latestFinalLibraryPacketArtifactUrl ? (
                      <div className="mt-4 rounded-[14px] border border-[#f4e2bf] bg-[#fff8ec] px-4 py-3 text-sm leading-6 text-[#7d520d]">
                        {!latestGeneratedLibraryPacketVersion
                          ? 'Generate the document before finalising.'
                          : !Number(selectedPacketSigningSummary?.signerCount || 0)
                            ? 'Prepare signers and signing fields first.'
                            : !(selectedPacketSigningSummary?.allSignersSigned || completedLibrarySignersCount === Number(selectedPacketSigningSummary?.signerCount || 0))
                              ? 'All signers must complete signing first.'
                              : Number(selectedPacketSigningSummary?.requiredSignatures || 0) <= 0
                                ? 'At least one required signature field is needed before finalisation.'
                                : 'All required signing fields must be completed first.'}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={studioPrimaryButtonClass}
                        onClick={() => void handleGenerateFinalSignedForLibraryPacket(selectedLibraryPacket)}
                        disabled={Boolean(packetActionId) || !canGenerateFinalLibraryPacket || Boolean(latestFinalLibraryPacketArtifactUrl)}
                      >
                        <ShieldCheck size={14} />
                        <span>{packetActionId.startsWith('finalise:') ? 'Finalising...' : 'Generate Final Signed'}</span>
                      </button>
                      {latestFinalLibraryPacketArtifactUrl ? (
                        <a
                          className={studioSecondaryButtonClass}
                          href={latestFinalLibraryPacketArtifactUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Eye size={14} />
                          <span>Open Final Signed</span>
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102033]">Completion Handover</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                          Package the final document, signing state, linked records, and audit trail for filing.
                        </p>
                      </div>
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                        libraryPacketHandoverReady
                          ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]'
                          : 'border-[#f4e2bf] bg-[#fff8ec] text-[#7d520d]',
                      ].join(' ')}
                      >
                        {libraryPacketHandoverReady ? 'Ready to file' : 'Not complete'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {libraryPacketHandoverSteps.map((step) => (
                        <div key={step.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className={[
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                              step.passed
                                ? 'border-[#cdebd8] bg-[#eef9f1] text-[#128642]'
                                : 'border-[#dbe7f3] bg-white text-[#7a8da6]',
                            ].join(' ')}
                            >
                              {step.passed ? <Check size={14} /> : <Clock3 size={14} />}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#102033]">{step.label}</p>
                              <p className="mt-1 truncate text-xs text-[#6b7c93]">{step.detail}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {[
                        { label: 'Audit events', value: selectedLibraryPacketEvents.length },
                        { label: 'Artifacts', value: [latestLibraryPacketArtifactUrl, latestFinalLibraryPacketArtifactUrl].filter(Boolean).length },
                        { label: 'Linked records', value: [
                          selectedLibraryPacket.transaction_id,
                          selectedLibraryPacket.lead_id,
                          selectedLibraryPacket.deal_id,
                          selectedLibraryPacket.unit_id,
                        ].filter((value) => normalizeText(value)).length },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">{item.label}</p>
                          <p className="mt-2 text-lg font-semibold text-[#102033]">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {latestFinalLibraryPacketArtifactUrl ? (
                        <a
                          className={studioPrimaryButtonClass}
                          href={latestFinalLibraryPacketArtifactUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ShieldCheck size={14} />
                          <span>Open Final Document</span>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={handleDownloadLibraryPacketHandoverManifest}
                        disabled={!libraryPacketHandoverManifest}
                      >
                        <FileText size={14} />
                        <span>Download Manifest</span>
                      </button>
                    </div>

                    {!libraryPacketHandoverReady ? (
                      <p className="mt-4 rounded-[14px] border border-[#eef2f6] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#607387]">
                        Complete the checklist above before treating this document as filed.
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                    <p className="text-sm font-semibold text-[#102033]">Activity</p>
                    {selectedLibraryPacketEvents.length ? (
                      <div className="mt-3 space-y-2">
                        {selectedLibraryPacketEvents.slice(0, 5).map((event) => (
                          <div key={event.id} className="rounded-[14px] border border-[#e8eff7] bg-[#fbfdff] px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">{normalizeText(event.event_type).replace(/_/g, ' ')}</p>
                            <p className="mt-1 text-xs leading-5 text-[#6b7c93]">{formatDateTime(event.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-[#6b7c93]">No document activity has been recorded yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <SettingsEmptyState
                  title="No document selected"
                  description="Create or select a draft document to inspect versions and actions."
                />
              )}
            </TemplateStudioPanel>

            <TemplateStudioPanel
              eyebrow="Library Filters"
              title="Document Context"
              description="Use these contexts when deciding where a document belongs."
            >
              <div className="flex flex-wrap gap-2">
                {['Lead', 'Listing', 'Transaction', 'Client', 'Document type', 'Status', 'Owner'].map((item) => (
                  <span key={item} className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                    {item}
                  </span>
                ))}
              </div>
            </TemplateStudioPanel>
          </div>
        </div>
      ) : null}

      {showPublishConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgba(16,32,51,0.28)] px-4 py-8">
          <div className="w-full max-w-3xl rounded-[30px] border border-[#dbe7f3] bg-white p-6 shadow-[0_28px_60px_rgba(15,23,42,0.24)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da6]">Publishing</p>
            <h2 className="mt-3 text-[1.35rem] font-semibold text-[#102033]">Review before publishing</h2>
            <p className="mt-3 text-sm leading-7 text-[#6b7c93]">
              New documents of this type will use this version going forward. Existing transactions will not be changed.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                { label: 'Changed sections', value: publishReview.changedSectionCount },
                { label: 'Locked sections', value: publishReview.lockedSectionCount },
                { label: 'Signing fields', value: publishReview.signingFieldCount },
                { label: 'Warnings', value: publishReview.warnings.length },
              ].map((item) => (
                <div key={`publish-review-${item.label}`} className="rounded-[16px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#102033]">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                <p className="text-sm font-semibold text-[#102033]">Replacing live template</p>
                <p className="mt-2 text-sm leading-6 text-[#6b7c93]">{publishReview.liveTemplateLabel}</p>
                <p className="mt-3 text-sm font-semibold text-[#102033]">With</p>
                <p className="mt-2 text-sm leading-6 text-[#6b7c93]">{publishReview.currentTemplateLabel}</p>
              </div>

              <div className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                <p className="text-sm font-semibold text-[#102033]">Change summary</p>
                <div className="mt-3 space-y-2 text-sm leading-6 text-[#52667d]">
                  <p>{publishReview.metadataChanged ? 'Metadata changed.' : 'Metadata unchanged.'}</p>
                  <p>{publishReview.addedSectionCount} section{publishReview.addedSectionCount === 1 ? '' : 's'} added.</p>
                  <p>{publishReview.removedSectionCount} section{publishReview.removedSectionCount === 1 ? '' : 's'} removed.</p>
                  <p>{publishReview.conditionCount} conditional clause{publishReview.conditionCount === 1 ? '' : 's'} configured.</p>
                </div>
              </div>
            </div>

            {publishReview.contentScan ? (
              <div className={[
                'mt-5 rounded-[18px] border p-4',
                publishReview.contentScan.isValidForPublish
                  ? 'border-[#cdebd8] bg-[#eef9f1]'
                  : 'border-[#f3d1ce] bg-[#fff4f3]',
              ].join(' ')}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#102033]">Mandate content gate</p>
                    <p className="mt-2 text-sm leading-6 text-[#52667d]">
                      {publishReview.contentScan.routeLabel} checked with {publishReview.contentScan.scannerVersion}.
                    </p>
                  </div>
                  <span className={[
                    'rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                    publishReview.contentScan.isValidForPublish
                      ? 'border-[#b8e5c7] bg-white text-[#128642]'
                      : 'border-[#e9b7b2] bg-white text-[#8e1f15]',
                  ].join(' ')}
                  >
                    {publishReview.contentScan.isValidForPublish ? 'Passed' : 'Blocked'}
                  </span>
                </div>
                {publishReview.contentScanBlockers.length ? (
                  <div className="mt-3 space-y-2">
                    {publishReview.contentScanBlockers.slice(0, 4).map((item) => (
                      <ValidationIssueCard key={`publish-content-scan-blocker-${item}`} issue={item} tone="error" label="Mandate Scan" />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#128642]">
                    <CheckCircle2 size={16} />
                    No route-content blockers detected.
                  </p>
                )}
              </div>
            ) : null}

            {publishReview.changedSections.length ? (
              <div className="mt-5 rounded-[18px] border border-[#dbe7f3] bg-white p-4">
                <p className="text-sm font-semibold text-[#102033]">Changed sections</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {publishReview.changedSections.slice(0, 10).map(({ section, index }) => (
                    <span key={`changed-section-${section.sectionKey || index}`} className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                      {getFriendlySectionLabel(section, index)}
                    </span>
                  ))}
                  {publishReview.changedSections.length > 10 ? (
                    <span className="rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#607387]">
                      +{publishReview.changedSections.length - 10} more
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              {publishReview.blockers.length ? publishReview.blockers.map((item) => (
                <ValidationIssueCard key={`publish-blocker-${item}`} issue={item} tone="error" label="Publish" />
              )) : (
                <p className="flex items-center gap-2 rounded-[16px] border border-[#cdebd8] bg-[#eef9f1] px-4 py-3 text-sm font-semibold text-[#128642]">
                  <CheckCircle2 size={16} />
                  No blockers detected.
                </p>
              )}
              {publishReview.warnings.slice(0, 4).map((item) => (
                <ValidationIssueCard key={`publish-warning-${item}`} issue={item} tone="warning" label="Warning" />
              ))}
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm leading-6 text-[#445b73]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[#dbe7f3] text-[#128642] focus:ring-[#96d7ad]"
                checked={publishReviewAccepted}
                onChange={(event) => setPublishReviewAccepted(event.target.checked)}
                disabled={Boolean(publishReview.blockers.length)}
              />
              <span>I have reviewed the changes, locks, warnings, and live-template replacement.</span>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={studioSecondaryButtonClass} onClick={() => setShowPublishConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={studioPrimaryButtonClass}
                onClick={() => void confirmPublishTemplate()}
                disabled={saving || Boolean(publishReview.blockers.length) || !publishReviewAccepted}
              >
                <ShieldCheck size={14} />
                <span>{saving ? 'Publishing...' : 'Publish'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
