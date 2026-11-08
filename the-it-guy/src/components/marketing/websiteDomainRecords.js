// Ownership challenges and routing are different records; use provider values only.
export function websiteDomainRecords(domain) {
  const instructions = domain.dns_instructions || {}, config = instructions.configuration || {}
  const records = (Array.isArray(instructions.verification) ? instructions.verification : [])
    .map(row => ({ type: row.type, name: row.domain || row.name, value: row.value }))
    .filter(row => row.type && row.name && row.value)
  const best = rows => [...(Array.isArray(rows) ? rows : [])].sort((a,b) => Number(a.rank) - Number(b.rank))[0]?.value
  const apex = instructions.apexName === domain.hostname || config.configuredBy === 'A'
  const ipv4 = best(config.recommendedIPv4), cname = best(config.recommendedCNAME)
  if (apex && Array.isArray(ipv4)) for (const value of ipv4) records.push({ type: 'A', name: domain.hostname, value })
  else if (typeof cname === 'string' && cname) records.push({ type: 'CNAME', name: domain.hostname, value: cname })
  return records
}
