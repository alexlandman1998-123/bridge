export const BOND_APPLICATION_UX_AUDIT_VERSION = 'phase-9-v1'

export const BOND_APPLICATION_CURRENT_UX_SURFACES = Object.freeze([
  {
    key: 'buyer_bond_application_modal',
    label: 'Buyer bond application modal',
    currentState: 'A wide fixed overlay hosts the bond application inside the buyer portal.',
    evidence: ['buyer-bond-application-title', 'Application completion', 'Save Progress'],
  },
  {
    key: 'otp_locked_state',
    label: 'OTP locked state',
    currentState: 'The modal blocks application entry until signed OTP evidence unlocks the application.',
    evidence: ['Complete the OTP step', 'OTP: {otpStatusLabel}', 'Prefill ready'],
  },
  {
    key: 'application_tabs',
    label: 'Top-level application tabs',
    currentState: 'The modal uses application-level tabs for application, documents, and offer handling.',
    evidence: ['BOND_APPLICATION_TABS', 'activeBondApplicationTab'],
  },
  {
    key: 'section_sidebar',
    label: 'Section sidebar',
    currentState: 'The application tab uses a secondary section list with complete, partial, and pending states.',
    evidence: ['BOND_APPLICATION_SECTION_TABS', 'bondApplicationSectionStatusByKey'],
  },
  {
    key: 'prefill_review_band',
    label: 'Prefill review band',
    currentState: 'Prefill metadata is summarized above the active section.',
    evidence: ['data-bond-prefill-review-panel="true"', 'Already filled'],
  },
  {
    key: 'confirmation_cards',
    label: 'Confirmation cards',
    currentState: 'Supported sections can show confirmation-first cards before detailed fields.',
    evidence: ['data-bond-prefill-confirmation-cards="true"', 'Review and confirm'],
  },
  {
    key: 'section_actions',
    label: 'Section confirmation actions',
    currentState: 'Complete sections can be confirmed and collapsed, with missing fields linking into detail.',
    evidence: ['data-bond-prefill-section-actions="true"', 'Confirm Section', 'Complete Missing Field'],
  },
  {
    key: 'detailed_field_grids',
    label: 'Detailed field grids',
    currentState: 'Most sections still render dense editable grids using the legacy field contract.',
    evidence: ['renderBondInputField', 'renderBondApplicantSection'],
  },
  {
    key: 'documents_inside_application',
    label: 'Documents tab inside application',
    currentState: 'Bond supporting documents appear inside the application and link back to the portal document centre.',
    evidence: ['Bond supporting documents are linked here by type', 'Documents'],
  },
  {
    key: 'declarations_submit',
    label: 'Declarations and submit',
    currentState: 'Declarations collect consent checkboxes and trigger final buyer submission.',
    evidence: ['Submit Application', 'I confirm that all information submitted is true and complete.'],
  },
])

export const BOND_APPLICATION_UX_FRICTION_POINTS = Object.freeze([
  {
    key: 'modal_density',
    severity: 'high',
    targetPhase: 10,
    title: 'The modal still feels like a large desktop form container.',
    detail: 'The shell has improved, but the buyer still sees a broad overlay with multiple navigation layers and large field grids.',
  },
  {
    key: 'navigation_complexity',
    severity: 'high',
    targetPhase: 10,
    title: 'Top tabs plus section sidebar create competing navigation models.',
    detail: 'Buyers must understand application tabs, section tabs, section status, confirmation cards, and detailed fields at once.',
  },
  {
    key: 'partial_confirmation_coverage',
    severity: 'high',
    targetPhase: 10,
    title: 'Confirmation-first UX only covers the highest-value sections.',
    detail: 'Summary, personal details, contact/address, and finance/property are card-based; employment, income, banking, assets, credit, declarations, and documents still rely mainly on detailed fields.',
  },
  {
    key: 'source_badges_not_task_grouped',
    severity: 'medium',
    targetPhase: 10,
    title: 'Prefill source badges are useful but too granular for first-pass review.',
    detail: 'The buyer needs a simpler separation between confirmed, needs review, and needs input before seeing field-level provenance.',
  },
  {
    key: 'long_form_sections',
    severity: 'high',
    targetPhase: 10,
    title: 'Several sections remain dense grids of bank-form fields.',
    detail: 'Employment, income, banking, assets, and credit history need guided question groups, conditional reveals, totals, and cleaner scanning.',
  },
  {
    key: 'mobile_risk',
    severity: 'high',
    targetPhase: 10,
    title: 'The current structure is desktop-first.',
    detail: 'Wide modals, sticky sidebars, horizontal tabs, and two-column grids need a mobile-first stepper and stable action bar.',
  },
  {
    key: 'readiness_not_decisioned',
    severity: 'medium',
    targetPhase: 13,
    title: 'Completion exists, but readiness is not yet a clear submission decision.',
    detail: 'The buyer sees progress, but not a single operational ready/not-ready gate with blockers and next best action.',
  },
  {
    key: 'documents_context_split',
    severity: 'medium',
    targetPhase: 10,
    title: 'Documents are split between application context and the portal document centre.',
    detail: 'The user can upload from the application, but the relationship between application blockers and document tasks should be more explicit.',
  },
  {
    key: 'deep_link_resume_visibility',
    severity: 'medium',
    targetPhase: 14,
    title: 'Email deep-link and resume states need visible workflow assurance.',
    detail: 'The route can open the application, but the buyer experience should show why they landed there, what was saved, and what remains.',
  },
  {
    key: 'browser_e2e_gap',
    severity: 'high',
    targetPhase: 16,
    title: 'The flow has script coverage but limited browser-level UX proof.',
    detail: 'The real buyer journey still needs viewport checks, interaction checks, and submit-to-originator trace validation.',
  },
])

export const BOND_APPLICATION_TARGET_UX_PRINCIPLES = Object.freeze([
  {
    key: 'guided_not_form',
    label: 'Guided, not form-like',
    description: 'The first screen should feel like a guided application workspace, not a bank PDF translated into inputs.',
  },
  {
    key: 'confirm_before_type',
    label: 'Confirm before typing',
    description: 'Known information is confirmed in compact cards; typing is reserved for missing or changed details.',
  },
  {
    key: 'one_next_action',
    label: 'One next action',
    description: 'Each state should make the next best action obvious: confirm, complete missing field, upload document, or submit.',
  },
  {
    key: 'progress_with_blockers',
    label: 'Progress with blockers',
    description: 'Progress must explain what is blocking submission, not only show a percentage.',
  },
  {
    key: 'mobile_first',
    label: 'Mobile first',
    description: 'Navigation, cards, field groups, and action bars must work cleanly on narrow screens before desktop refinements.',
  },
  {
    key: 'provenance_on_demand',
    label: 'Provenance on demand',
    description: 'Source badges remain available, but first-pass UX groups information by confidence and action required.',
  },
  {
    key: 'originator_traceability',
    label: 'Originator traceability',
    description: 'Buyer confirmations, missing values, and documents must remain traceable in the originator handoff.',
  },
])

export const BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST = Object.freeze([
  {
    key: 'replace_modal_shell_with_task_workspace',
    priority: 'P0',
    title: 'Replace the form-heavy shell with a task workspace layout.',
    acceptance: 'The first unlocked state shows summary, next action, progress blockers, and section cards before detailed fields.',
  },
  {
    key: 'unify_navigation',
    priority: 'P0',
    title: 'Unify top tabs and section navigation into one clear stepper.',
    acceptance: 'The buyer sees one primary application path with predictable previous, next, save, and exit controls.',
  },
  {
    key: 'extend_confirmation_cards',
    priority: 'P0',
    title: 'Extend confirmation-first cards beyond the first four sections.',
    acceptance: 'Employment, income, banking, assets, credit, documents, and declarations have review-first summaries or guided task cards.',
  },
  {
    key: 'turn_dense_grids_into_question_groups',
    priority: 'P0',
    title: 'Turn dense field grids into guided question groups.',
    acceptance: 'Long bank sections are broken into short clusters with conditional reveal and inline totals where relevant.',
  },
  {
    key: 'add_next_best_action_bar',
    priority: 'P0',
    title: 'Add a persistent next-best-action bar.',
    acceptance: 'The primary action stays visible on desktop and mobile and changes based on missing field, confirmation, upload, save, or submit state.',
  },
  {
    key: 'make_documents_contextual',
    priority: 'P1',
    title: 'Make document requirements contextual to the application step.',
    acceptance: 'Document tasks clearly explain which application answers triggered them and whether they block submission.',
  },
  {
    key: 'improve_mobile_viewports',
    priority: 'P0',
    title: 'Redesign mobile navigation and field density.',
    acceptance: 'No horizontal tab dependency, clipped labels, overlapping controls, or two-column assumptions remain on mobile.',
  },
  {
    key: 'soften_source_badges',
    priority: 'P1',
    title: 'Move source/provenance into secondary detail.',
    acceptance: 'Buyer-facing cards prioritize confirmed/needs input states; source badges remain visible but not dominant.',
  },
  {
    key: 'clarify_saved_resume_state',
    priority: 'P1',
    title: 'Clarify saved and resume states.',
    acceptance: 'Returning buyers see last saved time, completed sections, and the exact next task.',
  },
  {
    key: 'preserve_originator_metadata',
    priority: 'P0',
    title: 'Preserve Phase 7 and Phase 8 metadata during UI redesign.',
    acceptance: 'Section confirmations and buyer confirmation confidence remain persisted and visible to originators.',
  },
])

export function buildBondApplicationUxAudit() {
  const highSeverityCount = BOND_APPLICATION_UX_FRICTION_POINTS.filter((item) => item.severity === 'high').length
  const phase10Items = BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST.filter((item) => item.priority === 'P0')

  return {
    version: BOND_APPLICATION_UX_AUDIT_VERSION,
    scope: 'buyer_portal_bond_application_ux',
    status: 'phase_9_audit_complete',
    summary: 'The buyer bond application has strong prefill and confirmation plumbing, but the unlocked buyer experience still needs a guided, mobile-first redesign before it feels production-grade.',
    currentSurfaces: BOND_APPLICATION_CURRENT_UX_SURFACES,
    frictionPoints: BOND_APPLICATION_UX_FRICTION_POINTS,
    targetUxPrinciples: BOND_APPLICATION_TARGET_UX_PRINCIPLES,
    phase10RedesignChecklist: BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST,
    metrics: {
      currentSurfaceCount: BOND_APPLICATION_CURRENT_UX_SURFACES.length,
      frictionPointCount: BOND_APPLICATION_UX_FRICTION_POINTS.length,
      highSeverityFrictionCount: highSeverityCount,
      targetPrincipleCount: BOND_APPLICATION_TARGET_UX_PRINCIPLES.length,
      phase10ChecklistCount: BOND_APPLICATION_PHASE_10_REDESIGN_CHECKLIST.length,
      phase10P0ChecklistCount: phase10Items.length,
    },
    gapsByPhase: {
      phase10: BOND_APPLICATION_UX_FRICTION_POINTS.filter((item) => item.targetPhase === 10).map((item) => item.key),
      phase13: BOND_APPLICATION_UX_FRICTION_POINTS.filter((item) => item.targetPhase === 13).map((item) => item.key),
      phase14: BOND_APPLICATION_UX_FRICTION_POINTS.filter((item) => item.targetPhase === 14).map((item) => item.key),
      phase16: BOND_APPLICATION_UX_FRICTION_POINTS.filter((item) => item.targetPhase === 16).map((item) => item.key),
    },
  }
}
