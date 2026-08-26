import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  BUYER_INTAKE_SOURCE_QUALIFICATION,
  BUYER_INTAKE_SOURCE_VIEWING,
  BUYER_INTAKE_VERSION,
  buildBuyerIntakeNotes,
  buildBuyerQualificationIntake,
  buildBuyerViewingIntake,
  parseBuyerIntakeNoteBlock,
} from '../src/services/buyerIntakeModel.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:buyer-intake-model-phase2'],
  'node scripts/buyer-intake-model-phase2.test.mjs',
  'package.json should expose the buyer intake model Phase 2 contract.',
)

const agencyPipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const buyerViewingPreferencesSource = await readFile(new URL('../../supabase/functions/buyer-viewing-preferences/index.ts', import.meta.url), 'utf8')

assert.match(agencyPipelineSource, /buildBuyerQualificationIntake/)
assert.match(agencyPipelineSource, /buildBuyerIntakeNotes/)
assert.match(buyerViewingPreferencesSource, /buildBuyerViewingIntake/)
assert.match(buyerViewingPreferencesSource, /buildBuyerIntakeNotes/)

const qualificationSnapshot = buildBuyerQualificationIntake(
  {
    budget: '3500000',
    areaInterest: 'Atlantic Seaboard',
    financeType: 'Bond',
  },
  {
    capturedAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:05:00.000Z',
  },
)

assert.equal(qualificationSnapshot.version, BUYER_INTAKE_VERSION)
assert.equal(qualificationSnapshot.source, BUYER_INTAKE_SOURCE_QUALIFICATION)
assert.equal(qualificationSnapshot.qualification.source, BUYER_INTAKE_SOURCE_QUALIFICATION)
assert.equal(qualificationSnapshot.qualification.complete, true)
assert.equal(qualificationSnapshot.qualification.answeredCount, 3)
assert.equal(qualificationSnapshot.capturedAt, '2026-08-26T08:00:00.000Z')
assert.equal(qualificationSnapshot.updatedAt, '2026-08-26T08:05:00.000Z')

const qualificationNotes = buildBuyerIntakeNotes(qualificationSnapshot, 'Existing note')
assert.match(qualificationNotes, /\[Buyer intake\]/)
assert.match(qualificationNotes, /buyer_intake_v1/)

const parsedQualification = parseBuyerIntakeNoteBlock(qualificationNotes)
assert.equal(parsedQualification.qualification.answers.budget, '3500000')
assert.equal(parsedQualification.qualification.answers.areaInterest, 'Atlantic Seaboard')
assert.equal(parsedQualification.qualification.answers.financeType, 'Bond')

const viewingSnapshot = buildBuyerViewingIntake(
  {
    confirmedPropertyIds: ['prop-1'],
    selectedPropertyIds: ['prop-1'],
    availabilityWindows: ['2026-08-27 09:00', '2026-08-28 14:00', '2026-08-29 16:00'],
    availabilitySlots: [
      {
        date: '2026-08-27',
        startTime: '09:00',
        endTime: '09:30',
        startAt: '2026-08-27T07:00:00.000Z',
        endAt: '2026-08-27T07:30:00.000Z',
        timezone: 'Africa/Johannesburg',
        label: '2026-08-27 09:00',
      },
      {
        date: '2026-08-28',
        startTime: '14:00',
        endTime: '14:30',
        startAt: '2026-08-28T12:00:00.000Z',
        endAt: '2026-08-28T12:30:00.000Z',
        timezone: 'Africa/Johannesburg',
        label: '2026-08-28 14:00',
      },
      {
        date: '2026-08-29',
        startTime: '16:00',
        endTime: '16:30',
        startAt: '2026-08-29T14:00:00.000Z',
        endAt: '2026-08-29T14:30:00.000Z',
        timezone: 'Africa/Johannesburg',
        label: '2026-08-29 16:00',
      },
    ],
    responseNotes: 'Works best after 4pm.',
    attendeeNotes: 'Partner and child',
    timezone: 'Africa/Johannesburg',
  },
  {
    existingIntake: parsedQualification,
    requestedAt: '2026-08-25T08:00:00.000Z',
    respondedAt: '2026-08-26T09:00:00.000Z',
    updatedAt: '2026-08-26T09:00:00.000Z',
  },
)

assert.equal(viewingSnapshot.source, BUYER_INTAKE_SOURCE_VIEWING)
assert.equal(viewingSnapshot.viewing.source, BUYER_INTAKE_SOURCE_VIEWING)
assert.equal(viewingSnapshot.viewing.confirmedPropertyIds[0], 'prop-1')
assert.equal(viewingSnapshot.viewing.availabilityWindows.length, 3)
assert.equal(viewingSnapshot.viewing.respondedAt, '2026-08-26T09:00:00.000Z')
assert.equal(viewingSnapshot.qualification.answers.budget, '3500000')
assert.equal(viewingSnapshot.qualification.complete, true)

const mergedNotes = buildBuyerIntakeNotes(viewingSnapshot, qualificationNotes)
const parsedMerged = parseBuyerIntakeNoteBlock(mergedNotes)
assert.deepEqual(parsedMerged.viewing.confirmedPropertyIds, ['prop-1'])
assert.deepEqual(parsedMerged.viewing.availabilityWindows, ['2026-08-27 09:00', '2026-08-28 14:00', '2026-08-29 16:00'])
assert.equal(parsedMerged.qualification.answers.areaInterest, 'Atlantic Seaboard')

const partialSafeSnapshot = buildBuyerQualificationIntake(
  {
    propertyNeed: 'Family home',
  },
  {
    existingIntake: viewingSnapshot,
    updatedAt: '2026-08-26T10:00:00.000Z',
  },
)

assert.equal(partialSafeSnapshot.qualification.answers.budget, '3500000')
assert.equal(partialSafeSnapshot.qualification.answers.propertyNeed, 'Family home')
assert.deepEqual(partialSafeSnapshot.viewing.confirmedPropertyIds, ['prop-1'])
assert.equal(partialSafeSnapshot.qualification.complete, true)

console.log('buyer intake model Phase 2 contract passed')
