// finance owns these operations and their existing recovery behavior.


export function isMissingRpcFunctionError(error, functionName = '') {
  if (!error) return false
  const message = String(error.message || error.details || error.hint || '').toLowerCase()
  const normalizedFunctionName = String(functionName || '')
    .trim()
    .toLowerCase()
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    message.includes('could not find the function') ||
    (message.includes('function') && normalizedFunctionName && message.includes(normalizedFunctionName))
  )
}
