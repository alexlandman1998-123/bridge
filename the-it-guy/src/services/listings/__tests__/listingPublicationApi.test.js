// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), enqueue: vi.fn(), worker: vi.fn(), waitUntil: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.enqueue }) }))
vi.mock('@vercel/functions', () => ({ waitUntil: mocks.waitUntil }))
vi.mock('../../../../server/services/listingPublicationJobs.js', () => ({ publicationJobClient: () => ({ auth: { getUser: mocks.getUser } }), runListingPublicationJobs: mocks.worker }))
import handler from '../../../../api/listings/publication-jobs.js'
function response() { return { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value) } } }
const env = { SUPABASE_URL: 'https://fixture.example', SUPABASE_ANON_KEY: 'public-fixture' }
const request = () => ({ method: 'POST', headers: { authorization: 'Bearer session' }, body: { listingId: 'listing', channels: ['property24'] } })
beforeEach(() => {
 vi.resetAllMocks()
 mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } } })
 mocks.enqueue.mockResolvedValue({ data: [{ id: 'job', channel: 'property24', state: 'queued' }] })
 mocks.worker.mockReturnValue(new Promise(() => {}))
})
it('acknowledges the durable request while the server worker is still running', async () => {
 const res = response()
 await handler(request(), res, env)
 expect(res.statusCode).toBe(202)
 expect(res.body.jobs[0].id).toBe('job')
 expect(mocks.enqueue).toHaveBeenCalledWith('enqueue_listing_publication', { p_listing_id: 'listing', p_channels: ['property24'] })
 expect(mocks.waitUntil).toHaveBeenCalledTimes(1)
 expect(mocks.worker).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing', env }))
})
it('does not start work if authentication or durable enqueue fails', async () => {
 const unauth = response()
 mocks.getUser.mockResolvedValueOnce({ error: new Error('expired') })
 await handler(request(), unauth, env)
 expect(unauth.statusCode).toBe(401)
 expect(mocks.enqueue).not.toHaveBeenCalled()
 const forbidden = response()
 mocks.enqueue.mockResolvedValueOnce({ error: { code: '42501', message: 'Cannot publish' } })
 await handler(request(), forbidden, env)
 expect(forbidden.statusCode).toBe(403)
 expect(mocks.worker).not.toHaveBeenCalled()
})
