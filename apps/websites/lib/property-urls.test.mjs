import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legacyPropertySlug, matchesPropertySlug, propertySlug } from './property-urls.ts'

const property = {
  id: 'bc200b93-0694-46e1-8c6c-3424b52bcd30',
  title: 'Modern family home',
  reference: 'A9-KING-000003',
}

test('uses the immutable Arch9 reference as the canonical public property URL', () => {
  assert.equal(propertySlug(property), 'A9-KING-000003')
})

test('accepts a legacy title-and-UUID URL so it can be permanently redirected', () => {
  assert.equal(legacyPropertySlug(property), 'modern-family-home-bc200b93-0694-46e1-8c6c-3424b52bcd30')
  assert.equal(matchesPropertySlug(property, legacyPropertySlug(property)), true)
  assert.equal(matchesPropertySlug(property, 'a9-king-000003'), true)
})
