import { CheckCircle2, FileText, LockKeyhole, UsersRound } from 'lucide-react'
import {
  describeLegalDocumentCondition,
  formatLegalDocumentFieldLabel,
} from '../../core/documents/legalDocumentWorkspacePresentation'
import {
  VISIBILITY_VALUELESS_OPERATORS,
  buildVisibilityConditionJson,
  normalizeVisibilityConditionInput,
} from '../../core/documents/sectionVisibilityRules'

const CONDITION_FIELDS = Object.freeze([
  { value: 'seller_entity_type', label: 'Seller type' },
  { value: 'buyer_entity_type', label: 'Buyer type' },
  { value: 'seller_marital_status', label: 'Seller marital status' },
  { value: 'buyer_marital_status', label: 'Buyer marital status' },
  { value: 'property_title_type', label: 'Property title type' },
  { value: 'finance_type', label: 'Finance type' },
  { value: 'legal_active_clause_packs', label: 'Active clause pack' },
])

const CONDITION_OPERATORS = Object.freeze([
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'in', label: 'is one of' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'is provided' },
  { value: 'missing', label: 'is not provided' },
])

const SIGNING_ROLES = Object.freeze([
  { value: 'client', label: 'Client' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'agent', label: 'Agent' },
  { value: 'witness', label: 'Witness' },
])

function formatBlockType(value = '') {
  if (value === 'signing') return 'Signing block'
  return formatLegalDocumentFieldLabel(value || 'legal_text')
}

export function BlockInspector({ block, editable, onChangeBlock }) {
  if (!block) {
    return (
      <aside className="rounded-[18px] border border-[#dce5ed] bg-white p-5 text-sm leading-6 text-[#728398] shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        Select a document block to see its settings.
      </aside>
    )
  }

  const conditionDescription = describeLegalDocumentCondition(block.condition)
  const appearsLabel = block.classification.conditional && conditionDescription === 'Always included'
    ? 'When situation matches'
    : conditionDescription
  const approvalLabel = block.approval.approved
    ? 'Attorney approved'
    : block.approval.status === 'attorney_review'
      ? 'Attorney review in progress'
      : 'Approval required'
  const conditionInput = normalizeVisibilityConditionInput(block.condition)
  const complexCondition = Boolean(
    block.condition?.all || block.condition?.any || block.condition?.not || block.condition?.rules,
  )

  const updateCondition = (patch) => {
    onChangeBlock(block.id, {
      condition: buildVisibilityConditionJson({ ...conditionInput, ...patch, enabled: true }),
    })
  }

  const updateSigning = (patch) => {
    const signing = { ...block.signing, ...patch, modified: true }
    const requirement = signing.requirement || 'none'
    const signingFields = Array.isArray(signing.fields) ? signing.fields : []
    onChangeBlock(block.id, {
      signing: {
        ...signing,
        fields: signingFields,
        configured: requirement !== 'none' || signingFields.length > 0,
        requiresInitial: requirement === 'client_initial',
        requiresSignature: requirement === 'client_signature',
      },
    })
  }

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start" aria-labelledby="block-settings-title">
      <section className="rounded-[18px] border border-[#dce5ed] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7c8ea2]">Selected block</p>
        {editable ? (
          <div className="mt-3">
            <h2 id="block-settings-title" className="text-lg font-semibold text-[#102033]">Block settings</h2>
            <label htmlFor={`block-label-${block.id}`} className="mt-4 block text-xs font-semibold text-[#52677e]">Block name</label>
            <input
              id={`block-label-${block.id}`}
              type="text"
              value={block.label}
              onChange={(event) => onChangeBlock(block.id, { label: event.target.value })}
              className="mt-2 min-h-11 w-full rounded-[11px] border border-[#cfdce6] bg-white px-3 text-sm font-semibold text-[#20364c] outline-none transition focus:border-[#16804d] focus:ring-2 focus:ring-[#16804d]/15"
            />
          </div>
        ) : (
          <h2 id="block-settings-title" className="mt-2 text-lg font-semibold text-[#102033]">{block.label}</h2>
        )}

        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-xs font-semibold text-[#52677e]">Block type</dt>
            <dd className="mt-2 flex min-h-11 items-center gap-2 rounded-[11px] border border-[#dce5ed] bg-[#fbfcfd] px-3 text-sm font-medium text-[#33485e]">
              <FileText className="h-4 w-4 text-[#70859a]" aria-hidden="true" />
              {formatBlockType(block.kind)}
            </dd>
          </div>
          {editable && block.classification.conditional ? (
            <div>
              <dt className="text-xs font-semibold text-[#52677e]">Automatic inclusion</dt>
              {complexCondition ? (
                <dd className="mt-2 rounded-[11px] border border-[#dce5ed] bg-[#f8fafc] px-3 py-3 text-xs leading-5 text-[#65788c]">This block uses a multi-part legal rule. Use Advanced to change it.</dd>
              ) : (
                <dd className="mt-2 space-y-2 rounded-[11px] border border-[#cfdce6] bg-[#fbfcfd] p-3">
                  <label className="block text-[11px] font-semibold text-[#65788c]">
                    Include when
                    <select
                      value={conditionInput.field}
                      onChange={(event) => updateCondition({ field: event.target.value })}
                      className="mt-1 min-h-10 w-full rounded-[9px] border border-[#d3dfe8] bg-white px-2 text-xs text-[#30455b]"
                    >
                      <option value="">Choose an answer</option>
                      {CONDITION_FIELDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-[11px] font-semibold text-[#65788c]">
                    Comparison
                    <select
                      value={conditionInput.operator}
                      onChange={(event) => updateCondition({ operator: event.target.value })}
                      className="mt-1 min-h-10 w-full rounded-[9px] border border-[#d3dfe8] bg-white px-2 text-xs text-[#30455b]"
                    >
                      {CONDITION_OPERATORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {!VISIBILITY_VALUELESS_OPERATORS.includes(conditionInput.operator) ? (
                    <label className="block text-[11px] font-semibold text-[#65788c]">
                      Answer value
                      <input
                        type="text"
                        value={conditionInput.value}
                        onChange={(event) => updateCondition({ value: event.target.value })}
                        placeholder="For example: company"
                        className="mt-1 min-h-10 w-full rounded-[9px] border border-[#d3dfe8] bg-white px-2 text-xs text-[#30455b]"
                      />
                    </label>
                  ) : null}
                </dd>
              )}
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold text-[#52677e]">Appears</dt>
            <dd className="mt-2 rounded-[11px] border border-[#dce5ed] bg-[#fbfcfd] px-3 py-3 text-sm font-medium leading-6 text-[#33485e]">
              {appearsLabel}
            </dd>
          </div>
          {block.placeholderKeys.length ? (
            <div>
              <dt className="text-xs font-semibold text-[#52677e]">Data fields</dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {block.placeholderKeys.slice(0, 6).map((field) => (
                  <span key={field} className="rounded-[6px] border border-[#d5e7dc] bg-[#f2faf5] px-2 py-1 text-[11px] font-semibold text-[#397457]">
                    {formatLegalDocumentFieldLabel(field)}
                  </span>
                ))}
                {block.placeholderKeys.length > 6 ? <span className="px-1 py-1 text-[11px] font-semibold text-[#7a8ca0]">+{block.placeholderKeys.length - 6} more</span> : null}
              </dd>
            </div>
          ) : null}
          {block.signing.configured ? (
            <div>
              <dt className="text-xs font-semibold text-[#52677e]">Signing</dt>
              <dd className="mt-2 flex items-center gap-2 rounded-[11px] border border-[#dce5ed] bg-[#fbfcfd] px-3 py-3 text-sm text-[#33485e]">
                <UsersRound className="h-4 w-4 text-[#70859a]" aria-hidden="true" />
                {formatLegalDocumentFieldLabel(block.signing.role)} · {block.signing.fields.length || 1} field{block.signing.fields.length === 1 ? '' : 's'}
              </dd>
            </div>
          ) : null}
          {editable && block.classification.signing ? (
            <div>
              <dt className="text-xs font-semibold text-[#52677e]">Signing setup</dt>
              <dd className="mt-2 space-y-2 rounded-[11px] border border-[#cfdce6] bg-[#fbfcfd] p-3">
                <label className="block text-[11px] font-semibold text-[#65788c]">
                  Required action
                  <select
                    value={block.signing.requirement}
                    onChange={(event) => updateSigning({ requirement: event.target.value })}
                    className="mt-1 min-h-10 w-full rounded-[9px] border border-[#d3dfe8] bg-white px-2 text-xs text-[#30455b]"
                  >
                    <option value="none">No signature required</option>
                    <option value="client_initial">Initial this block</option>
                    <option value="client_signature">Sign this block</option>
                  </select>
                </label>
                <label className="block text-[11px] font-semibold text-[#65788c]">
                  Signer
                  <select
                    value={block.signing.role}
                    onChange={(event) => updateSigning({ role: event.target.value })}
                    className="mt-1 min-h-10 w-full rounded-[9px] border border-[#d3dfe8] bg-white px-2 text-xs text-[#30455b]"
                  >
                    {SIGNING_ROLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className={`mt-5 flex items-start gap-3 rounded-[12px] border px-3 py-3 ${block.approval.approved ? 'border-[#c9e5d3] bg-[#f1faf4]' : 'border-[#eadab9] bg-[#fffaf0]'}`}>
          {block.approval.approved
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#23804d]" aria-hidden="true" />
            : <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#986d20]" aria-hidden="true" />}
          <div>
            <strong className={`block text-xs font-semibold ${block.approval.approved ? 'text-[#246e47]' : 'text-[#825f21]'}`}>{approvalLabel}</strong>
            <span className="mt-0.5 block text-[11px] leading-5 text-[#718397]">Approval remains controlled by the existing legal review process.</span>
          </div>
        </div>
        {editable ? (
          <p className="mt-3 text-[11px] leading-5 text-[#718397]">Changing legal wording automatically returns an approved block to attorney review.</p>
        ) : null}
      </section>
    </aside>
  )
}
