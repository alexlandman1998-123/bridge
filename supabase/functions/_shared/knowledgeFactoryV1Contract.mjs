export const KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT = 'https://propinfoapi.co.za/uat/v1/graphql/';
export const KNOWLEDGE_FACTORY_API_VERSION = 'v1';
export function isKnowledgeFactoryV1UatEndpoint(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'propinfoapi.co.za' &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      ['/uat/v1/graphql', '/uat/v1/graphql/'].includes(url.pathname);
  } catch { return false; }
}
export function propertyReportQuery(selection, operationName = 'PropertyReport') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(operationName)) throw new Error('Invalid supplier operation name.');
  return `query ${operationName}($id: Int!) { propertyReports(first: 1, where: { propertyId: { eq: $id } }) { nodes { ${selection} } } }`;
}
export function supplierProperty(payload, expectedId) {
  const nodes = payload?.data?.propertyReports?.nodes;
  if (!Array.isArray(nodes) || !nodes.length) return null;
  if (nodes.length !== 1 || !nodes[0] || typeof nodes[0] !== 'object') throw new Error('Unexpected supplier property response.');
  if (expectedId !== undefined && Number(nodes[0].propertyId) !== Number(expectedId)) throw new Error('Supplier returned a different property.');
  return nodes[0];
}
export function connectionItems(value, requireComplete = false) {
  if (requireComplete && value?.pageInfo?.hasNextPage === true) throw new Error('The owner list exceeds this report package limit. A complete owner report requires a separately approved query.');
  return Array.isArray(value?.nodes) ? value.nodes : [];
}
export function currentSupplierTransfer(property) {
  return connectionItems(property?.currentOwnership)[0] || null;
}
