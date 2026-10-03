const transient = (error) => ['57014', '08006', '08001', '53300'].includes(error?.code)
  || [502, 503, 504].includes(error?.status)
  || /failed to fetch|network|timeout|timed out|abort/i.test(error?.message || '')

// Read-only RPCs may recover once. Authentication and schema failures must
// reach the caller unchanged; never substitute a public/table reader.
export async function readSellerPortalRpc(client, name, args, { timeoutMs = 10000 } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    let timer
    try {
      const query = client.rpc(name, args).abortSignal(controller.signal)
      const result = await Promise.race([
        query,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(Object.assign(new Error('Seller portal read timed out.'), { code: '57014' }))
          }, timeoutMs)
        }),
      ])
      if (result.error && !['42501', 'PGRST301', 'PGRST202'].includes(result.error.code)
        && transient(result.error) && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 400))
        continue
      }
      return result
    } catch (error) {
      if (['42501', 'PGRST301', 'PGRST202'].includes(error?.code) || !transient(error) || attempt === 1) throw error
      await new Promise(resolve => setTimeout(resolve, 400))
    } finally {
      clearTimeout(timer)
    }
  }
}

export async function settleOptionalSellerRead(task, timeoutMs = 4000) {
  let timer
  try {
    return await Promise.race([
      task,
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
