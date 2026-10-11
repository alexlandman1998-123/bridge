import { createLegalDocumentService } from './legalDocumentService.js';
/** Authenticated RPC boundary for Arch9 Legal. Does not import conveyancing APIs. */
export const LEGAL_DISCIPLINES = Object.freeze(['wills_estates', 'trusts', 'debt_collection', 'family_law']);
const ACTIONS = new Set(['configure', 'create_client', 'update_client', 'create_matter', 'update_matter', 'review_intake', 'set_team', 'add_party', 'remove_party']);
const REVISION_ACTIONS = new Set(['configure', 'update_client', 'update_matter', 'review_intake', 'set_team', 'add_party', 'remove_party']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createLegalMatterService(client) {
  if (typeof client?.rpc !== 'function') throw new TypeError('An authenticated database client is required');
  async function call(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('Legal service returned no result');
    return data;
  }
  function firmId(firm) {
    if (!UUID.test(firm)) throw new TypeError('A valid firm identity is required');
    return firm;
  }
  return Object.freeze({
    ...createLegalDocumentService(client, call, firmId),
    /** Retain requestId and the exact payload on retry, including after a lost response. */
    command({ firmId: firm, requestId, action, payload }) {
      firmId(firm);
      if (!UUID.test(requestId)) throw new TypeError('A stable request identity is required');
      if (!ACTIONS.has(action)) throw new TypeError('Unsupported legal command');
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new TypeError('A command payload is required');
      if (REVISION_ACTIONS.has(action) && (!Number.isSafeInteger(payload.expected_revision) || payload.expected_revision < 0)) {
        throw new TypeError('The current revision is required');
      }
      return call('arch9_legal_command', { p_firm_id: firm, p_request_id: requestId, p_action: action, p_payload: payload });
    },
    create({ firmId: firm, requestId, payload }) {
      if (!UUID.test(requestId)) throw new TypeError('A stable request identity is required');
      return call('arch9_legal_create', { p_firm_id: firmId(firm), p_request_id: requestId, p_payload: payload });
    },
    party({ firmId: firm, requestId, payload }) {
      if (!UUID.test(requestId)) throw new TypeError('A stable request identity is required');
      return call('arch9_legal_party', { p_firm_id: firmId(firm), p_request_id: requestId, p_payload: payload });
    },
    overview({ firmId: firm, requestId, payload }) {
      if (!UUID.test(requestId)) throw new TypeError('A stable request identity is required');
      return call('arch9_legal_overview', { p_firm_id: firmId(firm), p_request_id: requestId, p_payload: payload });
    },
    directory(firm, discipline) {
      return call('arch9_legal_directory', { p_firm_id: firmId(firm), p_discipline: discipline });
    },
    trustPilot(firm) { return call('arch9_legal_trust_pilot_read', { p_firm_id: firmId(firm) }); },
    firmOverview(firm, discipline = null) { return call('arch9_legal_firm_overview', { p_firm_id: firmId(firm), p_discipline: discipline }); },
    context(firm) { return call('arch9_legal_read', { p_firm_id: firmId(firm), p_kind: 'context', p_options: {} }); },
    matter(firm, matterId) {
      if (!UUID.test(matterId)) throw new TypeError('A valid matter identity is required');
      return call('arch9_legal_read', { p_firm_id: firmId(firm), p_kind: 'matter', p_options: { matter_id: matterId } });
    },
    register(firm, options = {}) {
      return call('arch9_legal_read', { p_firm_id: firmId(firm), p_kind: 'matters', p_options: { ...options } });
    },
    clients(firm, options = {}) {
      return call('arch9_legal_read', { p_firm_id: firmId(firm), p_kind: 'clients', p_options: { ...options } });
    },
  });
}
