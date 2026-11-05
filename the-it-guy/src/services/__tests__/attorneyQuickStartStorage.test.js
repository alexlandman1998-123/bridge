import { describe, expect, it } from 'vitest'
import { saveAttorneyQuickStartDetails } from '../attorneyFirms'

function fixtureClient({ settingsError = null, existingBrand = true } = {}) {
  const writes = []
  const scopes = []
  return {
    writes, scopes,
    from(table) {
      let operation = 'select'
      const builder = {
        select() { return builder },
        eq(key, value) { scopes.push({ table, key, value }); return builder },
        upsert(value) { operation = 'upsert'; writes.push({ table, operation, value }); return builder },
        update(value) { operation = 'update'; writes.push({ table, operation, value }); return builder },
        insert(value) { operation = 'insert'; writes.push({ table, operation, value }); return builder },
        async maybeSingle() {
          return { data: table === 'organisation_settings'
            ? { settings_json: { existingPreference: true, otherModule: { untouched: true } } }
            : existingBrand ? { organisation_id: 'owned-org' } : null }
        },
        async single() { return { data: { organisation_id: 'owned-org' }, error: table === 'organisation_settings' ? settingsError : null } },
      }
      return builder
    },
  }
}

describe('attorney onboarding metadata storage', () => {
  const firm = { id: 'owned-firm', organisationId: 'owned-org', name: 'Example Legal' }
  const branding = { logoIconUrl: 'https://example.test/icon.svg', primaryColour: '#166b50', secondaryColour: '#152621' }

  it('preserves existing settings and scopes icon updates to the firm organisation', async () => {
    const client = fixtureClient()
    await saveAttorneyQuickStartDetails(client, firm, { lpcNumber: ' LPC-123 ' }, branding)
    expect(client.writes[0].value.settings_json).toMatchObject({
      existingPreference: true, otherModule: { untouched: true },
      attorneyQuickStart: { lpcNumber: 'LPC-123', branding },
    })
    expect(client.writes[1]).toEqual({ table: 'organisation_branding', operation: 'update', value: { logo_icon_url: branding.logoIconUrl } })
    expect(client.scopes).toContainEqual({ table: 'organisation_branding', key: 'organisation_id', value: firm.organisationId })
  })

  it('does not write empty icon data when branding is skipped', async () => {
    const client = fixtureClient()
    await saveAttorneyQuickStartDetails(client, firm, {}, {})
    expect(client.writes).toHaveLength(1)
  })

  it('creates the canonical branding row if the firm has none yet', async () => {
    const client = fixtureClient({ existingBrand: false })
    await saveAttorneyQuickStartDetails(client, firm, {}, branding)
    expect(client.writes[2]).toMatchObject({ table: 'organisation_branding', operation: 'insert', value: {
      organisation_id: firm.organisationId, logo_icon_url: branding.logoIconUrl,
      primary_brand_color: branding.primaryColour, secondary_brand_color: branding.secondaryColour,
    } })
  })

  it('propagates permission failures so an unsuccessful save cannot be reported complete', async () => {
    const error = { code: '42501', message: 'Permission denied' }
    const client = fixtureClient({ settingsError: error })
    await expect(saveAttorneyQuickStartDetails(client, firm, {}, branding)).rejects.toBe(error)
    expect(client.writes).toHaveLength(1)
  })
})
