export function firmOverviewAllowed(env, legal) {
  return env.VITE_ARCH9_LEGAL_OVERVIEW_ENABLED === 'true' && Boolean(legal?.available && legal.context?.capabilities?.can_manage && legal.context?.grants?.length);
}
export function legalRegisterRows(result) {
  return {...result, rows: result.rows.map(m=>({key:`legal:${m.id}`,reference:m.reference,title:m.title,status:m.status.replaceAll('_',' '),href:`/legal/matters/${m.id}`,source:'legal'}))};
}
export function conveyancingRegisterRows(workspace, firmId) {
  // Reader owns scope, workflow roles, deduplication, sort and pagination. Never expand lanes into generic matters.
  return {rows:workspace.tableRows.map(m=>({key:`conveyancing:${firmId}:${m.transactionId||m.matterId||m.id}`,reference:m.reference,title:m.propertyLabel||m.property||m.reference,status:m.status,href:m.actionHref,source:'conveyancing'})),total:workspace.pagination.totalRows,page:workspace.pagination.page,page_size:workspace.pagination.pageSize,scope:workspace.scope.canViewAllMatterLists?'firm':'assigned'};
}
