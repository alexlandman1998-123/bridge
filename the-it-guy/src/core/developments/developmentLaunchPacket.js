const text = (value) => String(value || '').trim()

export function buildDevelopmentLaunchPacket({ development = {}, readiness = {}, units = [], structureNodes = [], productCatalogue = null, listings = [] } = {}) {
  const statusCounts = units.reduce((counts, unit) => {
    const status = text(unit.status || unit.transactionStage || 'available').toLowerCase()
    counts[status] = (counts[status] || 0) + 1
    return counts
  }, {})
  return {
    packetVersion: 'development-launch-packet-v1',
    generatedAt: new Date().toISOString(),
    development: {
      id: development.id || '',
      name: development.name || '',
      location: development.location || development.city || '',
      status: development.status || '',
      launchDate: development.launch_date || development.launchDate || null,
    },
    releaseDecision: readiness.launchReady ? 'ready' : 'blocked',
    readiness: {
      score: readiness.score || 0,
      blockers: (readiness.blockers || []).map((gate) => ({ id: gate.id, label: gate.label, detail: gate.detail, area: gate.tab })),
      gates: (readiness.gates || []).map((gate) => ({ id: gate.id, label: gate.label, ready: gate.ready, required: gate.required, detail: gate.detail })),
    },
    inventory: { totalUnits: units.length, statusCounts, pricedUnits: units.filter((unit) => Number(unit.listPrice || unit.list_price || unit.price || 0) > 0).length },
    structure: { nodeCount: structureNodes.length, nodeTypes: [...new Set(structureNodes.map((node) => node.nodeType).filter(Boolean))] },
    catalogue: { unitTypeCount: productCatalogue?.unitTypes?.length || 0, floorplanCount: productCatalogue?.floorplans?.length || 0, currentPriceBook: productCatalogue?.priceBooks?.find((book) => book.isDefault)?.name || null },
    distribution: { linkedListingCount: listings.length, publicOrLiveListingCount: listings.filter((listing) => /live|published|active|public|visible/i.test(`${listing.status || ''} ${listing.visibility || ''}`)).length },
  }
}

export function formatDevelopmentLaunchPacket(packet = {}) {
  const development = packet.development || {}
  const blockers = packet.readiness?.blockers || []
  return [
    `Development launch packet — ${development.name || 'Development'}`,
    `Decision: ${String(packet.releaseDecision || 'blocked').toUpperCase()} (${packet.readiness?.score || 0}%)`,
    `Generated: ${packet.generatedAt || ''}`,
    `Inventory: ${packet.inventory?.totalUnits || 0} units · ${packet.inventory?.pricedUnits || 0} directly priced`,
    `Structure: ${packet.structure?.nodeCount || 0} nodes`,
    `Catalogue: ${packet.catalogue?.unitTypeCount || 0} types · ${packet.catalogue?.floorplanCount || 0} floorplans`,
    `Distribution: ${packet.distribution?.linkedListingCount || 0} linked listings`,
    blockers.length ? `Blockers:\n${blockers.map((blocker) => `- ${blocker.label}: ${blocker.detail}`).join('\n')}` : 'Blockers: none',
  ].join('\n')
}
