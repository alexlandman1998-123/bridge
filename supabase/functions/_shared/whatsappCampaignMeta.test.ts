import { campaignMeta } from './whatsappCampaignMeta.ts'

Deno.test('campaign provider errors redact credentials and preserve definitive rejection status', async () => {
  const original = globalThis.fetch
  const token = 'diagnostic-fake-provider-token'
  globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ error: { message: `Rejected ${token}`, code: 190 } }), { status: 401 }))) as typeof fetch
  try {
    try {
      await campaignMeta({ meta_access_token: token }, '100/message_templates')
      throw new Error('Expected rejection')
    } catch (error) {
      if (!(error instanceof Error) || error.message.includes(token) || !error.message.includes('[redacted]') || !(error as Error & { definitive?: boolean }).definitive) throw error
    }
  } finally { globalThis.fetch = original }
})
