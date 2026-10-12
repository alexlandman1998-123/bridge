// A claimed durable job can delegate only publication of its saved listing.
// The RPC is service-only and rechecks current membership and listing status.
export async function websitePublicationJobContext({ caller, payload, partner = false }: {
  caller: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };
  payload: Record<string, unknown>; partner?: boolean;
}) {
  if (!payload.publicationJobId) return null;
  if (payload.action !== 'publish') throw new Error('Invalid background publication request.');
  const args = { p_job: payload.publicationJobId, p_claim: payload.publicationClaimId, p_partner: partner };
  const read = async () => {
    // Authenticate with the request's credential, never the function's admin
    // client. Only service_role can execute this RPC, including when the gateway
    // supplies a service JWT that differs from the legacy environment key.
    const result = await caller.rpc('listing_publication_website_context', args);
    if (result.error || !result.data?.actorId || result.data.listingId !== (payload.listingId || payload.listing_id)) throw new Error('Background publication access is unavailable.');
    return result.data;
  };
  const context = await read();
  return {
    actor: { data: { user: { id: context.actorId, email: context.actorEmail } }, error: null },
    statusClient: { rpc: async () => {
      try { return { data: (await read()).status, error: null }; }
      catch (error) { return { data: null, error: { message: (error as Error).message } }; }
    } },
  };
}
