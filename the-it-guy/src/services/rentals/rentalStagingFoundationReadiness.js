export const RENTAL_STAGING_FOUNDATION_REQUIRED_OBJECTS = Object.freeze([
  'rental_properties',
  'rental_units',
  'rental_vacancies',
  'rental_property_mandates',
  'rental_applications',
  'rental_tenancies',
  'rental_set_updated_at',
])

function text(value) {
  return String(value ?? '').trim()
}

export function parseSupabaseJson(output = '') {
  const source = text(output)
  const objectStart = source.indexOf('{')
  if (objectStart < 0) throw new Error('Supabase did not return a JSON payload.')
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(objectStart, index + 1))
    }
  }
  throw new Error('Supabase returned an incomplete JSON payload.')
}

export function parseSupabaseMigrationTable(output = '') {
  return text(output)
    .split('\n')
    .filter((line) => line.includes('|'))
    .map((line) => line.split('|').map((cell) => cell.trim().replaceAll('`', '').trim()))
    .filter(([local, remote, time]) => local !== 'Local' && remote !== 'Remote' && time !== 'Time (UTC)')
    .filter(([local, remote, time]) => ![local, remote, time].every((cell) => /^-+$/.test(cell)))
    .filter(([local, remote, time]) => local || remote || time)
    .map(([local = '', remote = '', time = '']) => ({ local, remote, time }))
}

export function assessRentalStagingFoundation({ migrations = [], catalog = {} } = {}) {
  const rows = Array.isArray(migrations) ? migrations : []
  const remoteOnlyMigrations = rows
    .filter((row) => text(row.remote) && !text(row.local))
    .map((row) => text(row.remote))
  const localOnlyMigrations = rows
    .filter((row) => text(row.local) && !text(row.remote))
    .map((row) => text(row.local))
  const missingObjects = RENTAL_STAGING_FOUNDATION_REQUIRED_OBJECTS
    .filter((name) => !catalog[name])

  return {
    version: 'arch9_rental_staging_foundation_readiness_v1',
    ready: remoteOnlyMigrations.length === 0 && localOnlyMigrations.length === 0 && missingObjects.length === 0,
    migrationLedger: {
      remoteOnlyMigrations,
      localOnlyMigrations,
      reconciled: remoteOnlyMigrations.length === 0 && localOnlyMigrations.length === 0,
    },
    catalog: {
      missingObjects,
      ready: missingObjects.length === 0,
    },
    nextAction: remoteOnlyMigrations.length || localOnlyMigrations.length
      ? 'Reconcile the staging migration ledger before applying rental schema changes.'
      : missingObjects.length
        ? 'Apply the approved managed rental foundation migrations one at a time, then rerun this gate.'
        : 'Staging rental foundation is ready for the lead-application-tenancy implementation gate.',
  }
}
