function reference(prefix = 'MOCK') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`
}

const mockProvider = {
  key: 'mock',
  label: 'Configured verification provider',
  checks: ['identity', 'address', 'sanctions', 'pep', 'risk'],
  cost: null,
  async startVerification({ subject = {} } = {}) {
    await new Promise((resolve) => setTimeout(resolve, 650))
    const providerReference = reference('VERIFY')
    return {
      status: 'verified',
      riskRating: 'low',
      verifiedAt: new Date().toISOString(),
      provider: 'Mock Compliance Provider',
      providerReference,
      reportReference: `normalized-report:${providerReference}`,
      checks: [
        { type: 'identity', status: 'verified', result: 'Verified' },
        { type: 'address', status: 'verified', result: 'Verified' },
        { type: 'sanctions', status: 'clear', result: 'Clear' },
        { type: 'pep', status: 'clear', result: 'Clear' },
        { type: 'risk', status: 'low', result: 'Low' },
      ],
      subjectReference: subject.clientContactId || '',
    }
  },
  async getVerificationStatus(run = {}) { return run },
  async getVerificationResult(run = {}) { return run },
  async getReport(run = {}) { return { reference: run.reportReference || '', normalized: true } },
}

const providers = new Map([['mock', mockProvider]])

export function getComplianceProvider(key = 'mock') {
  return providers.get(String(key || '').trim().toLowerCase()) || mockProvider
}

export function registerComplianceProvider(key, provider) {
  if (!key || !provider?.startVerification) throw new Error('A valid compliance provider is required.')
  providers.set(String(key).trim().toLowerCase(), provider)
}
