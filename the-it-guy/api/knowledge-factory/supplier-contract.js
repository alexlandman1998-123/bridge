import { createHash } from 'node:crypto';
export { KNOWLEDGE_FACTORY_UAT_V1_ENDPOINT, KNOWLEDGE_FACTORY_API_VERSION, isKnowledgeFactoryV1UatEndpoint, propertyReportQuery, supplierProperty, connectionItems, currentSupplierTransfer } from '../../../supabase/functions/_shared/knowledgeFactoryV1Contract.mjs';
export function supplierQueryFingerprint(query) {
  const canonical = query.replace(/^query\s+[A-Za-z_][A-Za-z0-9_]*/, 'query Package').replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(canonical).digest('hex');
}
