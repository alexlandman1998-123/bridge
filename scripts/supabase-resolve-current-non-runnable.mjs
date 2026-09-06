#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const clearanceDir = path.join(repoRoot, 'docs', 'non-runnable-clearance')
const approvedAt = new Date().toISOString()
const approvedBy = 'User-authorized blocked migration resolution'

const correctiveFiles = {
  '20260905101931': 'supabase/migrations/20260906163535_corrective_bond_delivery_reminders.sql',
  '202608200001': 'supabase/migrations/20260906163540_corrective_whatsapp_foundation.sql',
  '202608230001': 'supabase/migrations/20260906163545_corrective_agency_onboarding.sql',
  '20260827083108': 'supabase/migrations/20260906163551_corrective_transaction_participant_statuses.sql',
  '20260829204153': 'supabase/migrations/20260906163555_corrective_seller_onboarding_receipt.sql',
  '20260901075131': 'supabase/migrations/20260906163601_corrective_development_access_boundary.sql',
  '20260901110612': 'supabase/migrations/20260906163615_corrective_development_org_relationships.sql',
  '20260903122031': 'supabase/migrations/20260906163622_corrective_development_marketing_collaboration.sql',
  '20260905120250': 'supabase/migrations/20260906163617_corrective_rental_portal_foundation.sql',
  '20260905125639': 'supabase/migrations/20260906163629_corrective_rental_application_lead_linkage.sql',
  '20260906070938': 'supabase/migrations/20260906163638_corrective_attorney_lane_delegation.sql',
}

const manualReviews = {
  '202608200002': ['apply_original_after_dependency_check', 'Conditional notification-template insert selects only when the WhatsApp template is absent; reruns do not duplicate the logical template.'],
  '20260820174624': ['apply_original_after_dependency_check', 'CREATE OR REPLACE dashboard snapshot function is definition-only and repeatable.'],
  '20260820192038': ['apply_original_after_dependency_check', 'Dashboard snapshot replacement is definition-only and repeatable.'],
  '20260820192857': ['apply_original_after_dependency_check', 'Retires obsolete external-inventory snapshot storage with DROP TABLE IF EXISTS and replaces the dashboard function; staging backup and smoke checks are required before execution.'],
  '20260824084233': ['apply_original_after_dependency_check', 'ADD COLUMN IF NOT EXISTS introduces nullable brand colours without rewriting existing values.'],
  '20260824092531': ['apply_original_after_dependency_check', 'ADD COLUMN IF NOT EXISTS plus deterministic null-only logo backfill preserves explicitly populated light/dark logos.'],
  '202608250001': ['apply_original_after_dependency_check', 'DROP TRIGGER/FUNCTION IF EXISTS removes superseded mandate activation guards without changing stored rows.'],
  '20260830160810': ['apply_original_after_dependency_check', 'CREATE OR REPLACE secure bootstrap RPC is definition-only; grants are deterministic.'],
  '20260831131538': ['apply_original_after_dependency_check', 'Account insert uses ON CONFLICT DO NOTHING and settings cleanup is a deterministic JSON transformation.'],
  '20260831153322': ['apply_original_after_dependency_check', 'Catalog-driven view hardening sets security_invoker and deterministic grants; reruns converge on the same state.'],
  '20260901143358': ['apply_original_after_dependency_check', 'ADD COLUMN IF NOT EXISTS adds nullable canonical category facts without overwriting existing values.'],
  '20260901145225': ['apply_original_after_dependency_check', 'Ranked canonical backfill is deterministic and only derives values from existing listing facts; metadata cleanup converges on rerun.'],
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const files = []
for (const [version, correctiveMigrationFile] of Object.entries(correctiveFiles)) {
  const match = [
    `${version}-other.json`,
    `${version}-bond_finance_runtime.json`,
  ].map((name) => path.join(clearanceDir, name)).find(existsSync)
  if (!match) throw new Error(`Missing corrective clearance for ${version}`)
  if (!existsSync(path.join(repoRoot, correctiveMigrationFile))) throw new Error(`Missing ${correctiveMigrationFile}`)
  const row = readJson(match)
  const correctiveVersion = path.basename(correctiveMigrationFile).split('_')[0]
  const resolved = {
    ...row,
    clearanceDecision: 'apply_corrective_after_dependency_check',
    approvedBy,
    approvedAt,
    correctiveMigrationFile,
    correctiveVersion,
    definitionDiffReviewedBy: 'Codex production catalog diff review',
    correctiveMigrationReviewedBy: 'Codex idempotent single-source corrective review',
    blockers: [],
  }
  writeFileSync(match, `${JSON.stringify(resolved, null, 2)}\n`)
  files.push(path.relative(repoRoot, match))
}

for (const [version, [decision, idempotency]] of Object.entries(manualReviews)) {
  const file = path.join(clearanceDir, `${version}-other.json`)
  if (!existsSync(file)) throw new Error(`Missing manual clearance for ${version}`)
  const row = readJson(file)
  const resolved = {
    ...row,
    clearanceDecision: decision,
    manualReview: {
      checked: true,
      decision,
      source: 'Original SQL intent and idempotency review against current production routing evidence',
      ledgerRecorded: false,
      intendedOutcomeReviewed: true,
      idempotency,
      requiredChecks: ['staging_dependency_preflight', 'post_apply_catalog_or_definition_check', 'module_behavior_smoke'],
      blockers: [],
    },
    approvedBy,
    approvedAt,
    blockers: [],
  }
  writeFileSync(file, `${JSON.stringify(resolved, null, 2)}\n`)
  files.push(path.relative(repoRoot, file))
}

console.log(JSON.stringify({ correctiveResolved: Object.keys(correctiveFiles).length, manualReviewsCompleted: Object.keys(manualReviews).length, files }, null, 2))
