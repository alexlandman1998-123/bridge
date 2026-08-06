import { buildSellerProcessShadowIntegration } from './sellerProcessShadowIntegrationService.js'
import { buildSellerProcessEvidenceContext } from './sellerProcessEvidenceMappingService.js'

export const SELLER_PROCESS_SHADOW_WORKSPACE_KEY = 'sellerProcessShadowIntegration'

export function shouldAttachSellerProcessShadowIntegration(options = {}) {
  return options?.includeSellerProcessShadowIntegration === true ||
    options?.includeSellerProcessShadow === true ||
    options?.sellerProcessShadow === true
}

export function buildSellerLeadWorkspaceShadowIntegration(context = {}) {
  return buildSellerProcessShadowIntegration(buildSellerProcessEvidenceContext(context))
}

export function attachSellerProcessShadowIntegration(workspace = {}, context = {}, options = {}) {
  if (!shouldAttachSellerProcessShadowIntegration(options)) return workspace
  return {
    ...workspace,
    [SELLER_PROCESS_SHADOW_WORKSPACE_KEY]: buildSellerLeadWorkspaceShadowIntegration({
      ...context,
      row: context.row || workspace.row || null,
    }),
  }
}
