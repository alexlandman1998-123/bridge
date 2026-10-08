import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessExternal, assessVitest, localVerdict, scenarioEvidence } from './check-calendar-acceptance.mjs'

const cwd = '/local/app'
const report = () => ({ success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTests: 0, numTodoTests: 0, numTotalTests: 1,
  testResults: [{ name: '/local/app/calendar.test.js', status: 'passed', assertionResults: [{ title: 'closes the browser', fullName: 'Journey closes the browser', status: 'passed' }] }] })
test('accepts complete assertion evidence and rejects a green command with missing tests', () => {
  assert.equal(assessVitest(report(), ['calendar.test.js'], cwd).passed, true)
  for (const mutate of [r => { r.testResults = [] }, r => { r.testResults[0].name = '/local/app/unrelated.test.js' }, r => { r.numTotalTests = 2 }, r => { r.testResults[0].assertionResults = [] }]) {
    const value = report(); mutate(value)
    assert.equal(assessVitest(value, ['calendar.test.js'], cwd).passed, false)
  }
})
test('rejects failures, skips, todo and unfinished suites even with success true', () => {
  for (const status of ['failed', 'pending', 'skipped', 'todo']) {
    const value = report(); value.testResults[0].assertionResults[0].status = status
    assert.equal(assessVitest(value, ['calendar.test.js'], cwd).passed, false)
  }
  const value = report(); value.numFailedTestSuites = 1
  assert.equal(assessVitest(value, ['calendar.test.js'], cwd).passed, false)
})
test('maps only actual matching assertions in the intended file', () => {
  const scenarios = [{ id: 'A28', evidence: [{ file: 'calendar.test.js', titleContains: 'closes the browser' }] }]
  assert.equal(scenarioEvidence(scenarios, [{ stage: 'calendar-utc', report: report() }], cwd)[0].localEvidencePassed, true)
  const wrongFile = [{ id: 'A28', evidence: [{ file: 'other.test.js', titleContains: 'closes the browser' }] }]
  assert.equal(scenarioEvidence(wrongFile, [{ stage: 'calendar-utc', report: report() }], cwd)[0].localEvidencePassed, false)
  assert.equal(scenarioEvidence(scenarios, [], cwd)[0].localEvidencePassed, false)
})
test('requires both timezones, native concurrency, Edge, operator, attorney, app and a stable source snapshot', () => {
  const stages = ['calendar-utc', 'calendar-sast', 'attorney', 'concurrency', 'operator', 'edge', 'app'].map(name => ({ name, passed: true }))
  const scenarios = Array.from({ length: 42 }, (_, index) => ({ id: `A${index + 1}`, localEvidencePassed: true }))
  assert.equal(localVerdict(stages, scenarios, true), true)
  assert.equal(localVerdict(stages, scenarios, false), false)
  assert.equal(localVerdict(stages, scenarios.slice(1), true), false)
  for (const stage of stages) {
    assert.equal(localVerdict(stages.filter(item => item !== stage), scenarios, true), false)
    assert.equal(localVerdict(stages.map(item => item === stage ? { ...item, passed: false } : item), scenarios, true), false)
  }
})

test('rejects empty or skipped operator and Edge runs even when their process exits successfully', () => {
  const tap = '# tests 10\n# pass 10\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
  assert.equal(assessExternal(tap, 'operator').passed, true)
  assert.equal(assessExternal(tap.replace('# skipped 0', '# skipped 1'), 'operator').passed, false)
  assert.equal(assessExternal('', 'operator').passed, false)
  const edge = 'running 1 test from ./supabase/functions/worker/index.test.ts\nok | 1 passed | 0 failed (3ms)\n'
  assert.equal(assessExternal(edge, 'edge', ['worker/index.test.ts']).passed, true)
  assert.equal(assessExternal(edge, 'edge', ['missing/index.test.ts']).passed, false)
  assert.equal(assessExternal(edge.replace('0 failed', '0 failed | 1 ignored'), 'edge', ['worker/index.test.ts']).passed, false)
  assert.equal(assessExternal('', 'edge', ['worker/index.test.ts']).passed, false)
})
