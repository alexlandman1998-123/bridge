let cachedContext = null
let inflightRequest = null
let generation = 0

export function invalidateOrganisationContextRuntime() {
  generation += 1
  cachedContext = null
  inflightRequest = null
}

export function primeOrganisationContextRuntime(context) {
  if (!context?.organisation?.id) return context || null
  cachedContext = context
  return cachedContext
}

export function resolveOrganisationContextOnce(loader) {
  if (cachedContext) return Promise.resolve(cachedContext)
  if (inflightRequest) return inflightRequest
  if (typeof loader !== 'function') {
    return Promise.reject(new TypeError('An organisation-context loader is required.'))
  }

  const requestGeneration = generation
  const request = Promise.resolve()
    .then(loader)
    .then((context) => {
      if (requestGeneration === generation) cachedContext = context
      return context
    })
    .finally(() => {
      if (inflightRequest === request) inflightRequest = null
    })

  inflightRequest = request
  return request
}

export const __organisationContextRuntimeTestUtils = Object.freeze({
  getSnapshot: () => ({
    context: cachedContext,
    hasInflightRequest: Boolean(inflightRequest),
    generation,
  }),
  reset: invalidateOrganisationContextRuntime,
})
