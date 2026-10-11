// Presentation-only sample data. Never recorded as visitor activity.
export function isHarbourHeightsAnalyticsDemo(development = {}) {
  return development.id === '8b8d5c35-ba13-4175-a26b-cdec8f4c1891' ||
    /^harbour heights(?: residences)?$/i.test(String(development.name || '').trim())
}

function distribute(total, weights) {
  const sum = weights.reduce((value, weight) => value + weight, 0)
  const values = weights.map(weight => Math.floor(total * weight / sum))
  values[0] += total - values.reduce((value, count) => value + count, 0)
  return values
}

export function buildHarbourHeightsWebsiteAnalyticsDemo(days = 30) {
  const periodDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30
  const [sessions, sceneViews, unitOpens, enquiries, abandonments] = {
    7: [342, 918, 211, 28, 62],
    30: [1486, 4218, 986, 124, 283],
    90: [4163, 11782, 2741, 338, 764]
  }[periodDays]
  const sceneNames = ['Masterplan', 'The residences', 'Lifestyle & amenities', 'Location & surroundings']
  const sceneCounts = distribute(sceneViews, [42, 31, 18, 9])
  const enquiryCounts = distribute(enquiries, [36, 43, 15, 6])
  const dropoffCounts = distribute(abandonments, [39, 28, 21, 12])
  const openCounts = distribute(unitOpens, [25, 20, 16, 13, 10, 7, 5, 4])
  const deviceCounts = distribute(sessions, [66, 28, 6])
  return {
    periodDays,
    summary: { sessions, sceneViews, unitOpens, enquiries, abandonments, fallbacks: 0, enquiryRate: Math.round(enquiries * 1000 / sessions) / 10 },
    scenes: sceneNames.map((name, index) => ({ id: `demo-scene-${index}`, name, views: sceneCounts[index], enquiries: enquiryCounts[index] })),
    units: ['A-15', 'A-02', 'B-08', 'A-14', 'B-12', 'A-09', 'B-03', 'A-04'].map((unit_number, index) => ({ id: `demo-unit-${index}`, unit_number, opens: openCounts[index], shortlists: Math.round(openCounts[index] * (0.15 + index % 3 * 0.03)) })),
    dropoffs: sceneNames.map((name, index) => ({ id: `demo-scene-${index}`, name, abandonments: dropoffCounts[index] })),
    devices: ['mobile', 'desktop', 'tablet'].map((device, index) => ({ device, sessions: deviceCounts[index] }))
  }
}
