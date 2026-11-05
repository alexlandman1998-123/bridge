// Accepted saves may finish their reporting after the durable record returns.
// Drain that work before an intentional session change revokes its actor.
const pendingByTransaction = new Map()

export function trackTransactionBackgroundWork(transactionId, task) {
  const key = String(transactionId || '').trim()
  const pending = Promise.resolve(task)
  let tasks = pendingByTransaction.get(key)
  if (!tasks) { tasks = new Set(); pendingByTransaction.set(key, tasks) }
  tasks.add(pending)
  const release = () => {
    tasks.delete(pending)
    if (!tasks.size) pendingByTransaction.delete(key)
  }
  void pending.then(release, release)
  return pending
}

export async function flushTransactionBackgroundWork({ transactionId = null, timeoutMs = 0 } = {}) {
  const tasks = () => transactionId == null
    ? [...pendingByTransaction.values()].flatMap(group => [...group])
    : [...(pendingByTransaction.get(String(transactionId)) || [])]
  const drain = async () => {
    while (tasks().length) await Promise.allSettled(tasks())
    return { complete: true }
  }
  if (!timeoutMs) return drain()
  let timer
  try {
    return await Promise.race([
      drain(),
      new Promise(resolve => { timer = setTimeout(() => resolve({ complete: false }), timeoutMs) }),
    ])
  } finally { clearTimeout(timer) }
}
