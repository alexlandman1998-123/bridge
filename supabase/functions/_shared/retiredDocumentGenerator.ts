// No database client, renderer, storage write or background work is reachable here.
export function retiredDocumentGenerator(req: Request): Response {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({
    success: false,
    errorCode: 'document_generator_retired',
    error: 'The old document generator and signing workflow have been retired. Upload signed documents through the listing or transaction document workspace.',
    retryable: false,
  }), { status: 410, headers });
}
