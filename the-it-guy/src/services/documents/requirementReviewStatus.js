// Canonical requirement outcomes remain authoritative. Generated legacy rows
// carry upload flags, not review outcomes: read those from the matched file.
export function resolveRequirementReviewStatus(requirement = {}, document = null) {
  if (requirement.canonicalRequirementInstanceId || requirement.canonical_requirement_instance_id) {
    return requirement.status || document?.review_status || document?.status
  }
  if (['not_required', 'not_applicable', 'waived'].includes(requirement.status)) return requirement.status
  return document?.review_status || document?.status || requirement.status
}
