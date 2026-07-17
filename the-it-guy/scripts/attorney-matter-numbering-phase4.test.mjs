import assert from 'node:assert/strict'

import {
  buildAttorneyMatterNumberSettingsPayload,
  buildAttorneyMatterNumberingDraft,
  formatAttorneyMatterNumberPreview,
  getNextAttorneyMatterSequence,
  validateAttorneyMatterNumberSetting,
} from '../src/services/attorneyMatterNumberingService.js'

const draft = buildAttorneyMatterNumberingDraft([
  {
    lane: 'all',
    prefix: 'YL',
    suffix: 'LEGAL',
    separator: '/',
    include_year: true,
    year_format: 'YY',
    sequence_padding: 4,
    reset_frequency: 'continuous',
    enabled: true,
  },
  {
    lane: 'transfer',
    prefix: 'TRF',
    suffix: '',
    separator: '-',
    include_year: true,
    year_format: 'YYYY',
    sequence_padding: 6,
    reset_frequency: 'annual',
    enabled: true,
  },
])

assert.equal(draft.transfer.useFirmDefault, false)
assert.equal(draft.bond.useFirmDefault, true)
assert.equal(draft.bond.prefix, 'YL')
assert.equal(
  formatAttorneyMatterNumberPreview(draft.all, 8, new Date('2026-07-17T00:00:00Z')),
  'YL/26/0008/LEGAL',
)
assert.equal(
  formatAttorneyMatterNumberPreview({ ...draft.all, sequencePadding: 3 }, 12345, new Date('2026-07-17T00:00:00Z')),
  'YL/26/12345/LEGAL',
  'Sequence formatting must never truncate values that exceed the configured padding.',
)
assert.equal(
  getNextAttorneyMatterSequence([
    { lane: 'all', sequenceYear: 0, lastValue: 41 },
  ], draft.all, new Date('2026-07-17T00:00:00Z')),
  42,
)
assert.deepEqual(validateAttorneyMatterNumberSetting({ ...draft.all, prefix: '' }), ['Prefix is required.'])

const payload = buildAttorneyMatterNumberSettingsPayload(draft)
assert.deepEqual(payload.map((setting) => setting.lane), ['all', 'transfer'])
assert.equal(payload[0].sequence_padding, 4)
assert.equal(payload[0].reset_frequency, 'continuous')

console.log('attorney matter-numbering Phase 4 tests passed')
