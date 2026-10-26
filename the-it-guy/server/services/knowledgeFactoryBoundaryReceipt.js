import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifiedBoundaryGeometry } from '../../src/services/propertyIntelligence/knowledgeFactoryBoundary.js';
const lifetime = 2 * 60 * 60 * 1000;
const signature = (payload,key) => createHmac('sha256',key).update('arch9:kf-boundary:v1:' + payload).digest();
export function issueBoundaryReceipt({geometry,organisationId,actorId,propertyId,environment,key,now=Date.now()}) {
  const valid = verifiedBoundaryGeometry(geometry);
  if (!valid || !key || !['uat','live'].includes(environment)) return null;
  const payload = Buffer.from(JSON.stringify({version:1,organisationId,actorId,propertyId:String(propertyId),environment,retrievedAt:new Date(now).toISOString(),geometry:valid})).toString('base64url');
  // At most 25 map parcels: keep the response below the serverless payload limit.
  // Omit an oversized outline whole; never simplify away supplied rings.
  if (payload.length > 80000) return null;
  return payload + '.' + signature(payload,key).toString('base64url');
}
export function verifyBoundaryReceipt({receipt,organisationId,actorId,propertyId,environment,key,now=Date.now()}) {
  if (!receipt) return null;
  const invalid = () => Object.assign(new Error('The property outline could not be verified. Refresh the map before requesting an estimate.'),{status:400});
  if (typeof receipt !== 'string' || receipt.length > 80100 || !key) throw invalid();
  const [payload,mac,...extra] = receipt.split('.');
  const actual = Buffer.from(mac || '', 'base64url'), expected = signature(payload,key);
  if (extra.length || actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw invalid();
  let value;
  try { value=JSON.parse(Buffer.from(payload,'base64url').toString()); } catch { throw invalid(); }
  const age=now-Date.parse(value.retrievedAt);
  if (value.version!==1 || value.organisationId!==organisationId || value.actorId!==actorId || value.propertyId!==String(propertyId) || !Number.isFinite(age) || age<0 || age>lifetime || !verifiedBoundaryGeometry(value.geometry)) throw invalid();
  // A test map must never supply a boundary for a live report.
  if (value.environment!==environment) return {status:'unavailable',reason:'The selected outline came from a different supplier environment.'};
  return {status:'supplied',source:'Knowledge Factory map WKT',supplierEnvironment:value.environment,propertyId:value.propertyId,retrievedAt:value.retrievedAt,geometry:value.geometry};
}
