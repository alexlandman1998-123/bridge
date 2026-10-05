import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { buildMigrationHistoryReport, compareMigrationStatements, splitSqlStatements, verifiedRecordedStatements } from './audit-migration-history.mjs'

const local = (version, name, sql) => ({ version, name, sql, file: `${version}_${name}.sql` })
const remote = (version, name) => ({ version, name })

test('an already-recorded timestamp still detects a changed body and name', () => {
  const report = buildMigrationHistoryReport([local('1', 'seller', 'select 1;')], [remote('1', 'attorney')], new Map([['1', ['select 2;']]]))
  assert.equal(report.nameMismatches.length, 1)
  assert.equal(report.sameVersionDifferences[0].comparisons[0].status, 'recorded_statements_differ')
})

test('comments and ordinary formatting do not invent history changes', () => {
  assert.equal(compareMigrationStatements('-- old comment\nselect 1 ; /* note */', ['select 1;']).status, 'matching')
  assert.equal(compareMigrationStatements("select 'a -- literal';", ["select 'a -- changed';"]).status, 'recorded_statements_differ')
})

test('quoted identifiers, dollar bodies and literal semicolons stay intact', () => {
  const sql = `create function f() returns text as $body$ select 'semi;colon' $body$ language sql; select "semi;colon";`
  assert.equal(splitSqlStatements(sql).length, 2)
  assert.equal(compareMigrationStatements(sql, [sql]).status, 'matching')
})

test('nested comments preserve token gaps and cannot leak an internal semicolon', () => {
  const sql = 'select/* outer /* nested ; */ still comment */1; select 2;'
  assert.equal(splitSqlStatements(sql).length, 2)
  assert.equal(compareMigrationStatements(sql, ['select 1;', 'select 2;']).status, 'matching')
  assert.equal(compareMigrationStatements('select a/* gap */b;', ['select ab;']).status, 'recorded_statements_differ')
})

test('PostgreSQL escape strings and separated operators retain their meaning', () => {
  const sql = String.raw`select E'quote\'; still literal'; select 2;`
  assert.equal(splitSqlStatements(sql).length, 2)
  assert.equal(compareMigrationStatements(sql, [sql]).status, 'matching')
  assert.equal(compareMigrationStatements('select 2 - -1;', ['select 2 --1;']).status, 'recorded_statements_differ')
  assert.equal(compareMigrationStatements('select a > = b;', ['select a >= b;']).status, 'recorded_statements_differ')
})

test('statement order and repeated statements cannot disappear into a set comparison', () => {
  assert.equal(compareMigrationStatements('select 1; select 2;', ['select 2; select 1;']).status, 'recorded_statements_differ')
  assert.equal(compareMigrationStatements('select 1; select 1;', ['select 1;']).status, 'recorded_statements_differ')
})

test('empty recorded SQL is unavailable evidence, not proof a migration was absent', () => {
  assert.equal(compareMigrationStatements('select 1;', []).status, 'recorded_sql_unavailable')
  assert.equal(compareMigrationStatements('', []).status, 'matching')
})

test('renames, missing source and local-only files remain visible', () => {
  const report = buildMigrationHistoryReport([local('2', 'seller', 'select 1;'), local('3', 'pending', 'select 3;')], [remote('1', 'seller'), remote('4', 'missing')], new Map([['1', ['select 1;']]]))
  assert.equal(report.exactRenames.length, 1)
  assert.equal(report.missingSources.length, 1)
  assert.equal(report.localOnly.length, 2)
})

test('duplicate local versions are reported rather than selecting an arbitrary file', () => {
  const report = buildMigrationHistoryReport([local('1', 'seller', 'select 1;'), local('1', 'other', 'select 2;')], [remote('1', 'seller')], new Map([['1', ['select 1;']]]))
  assert.equal(report.duplicateLocalVersions.length, 1)
  assert.equal(report.sameVersionDifferences.length, 1)
})

test('reports never include recorded SQL or secrets embedded in it', () => {
  const report = buildMigrationHistoryReport([local('1', 'seller', "select 'synthetic-local-secret';")], [remote('1', 'seller')], new Map([['1', ["select 'synthetic-remote-secret';"]]]))
  assert.ok(!JSON.stringify(report).includes('synthetic-'))
})

test('old statement archives cannot stand in for a changed live migration', () => {
  const digest = value => createHash('md5').update(value).digest('hex')
  const rows = [{ version: '1', sql_hash: digest('select 2;') }, { version: '2', sql_hash: digest('select 2;') }, { version: '3', sql_hash: null }]
  const verified = verifiedRecordedStatements(rows, [{ version: '1', statements: ['select 1;'] }, { version: '2', statements: ['select 2;'] }, { version: '3', statements: null }])
  assert.equal(verified.has('1'), false)
  assert.equal(verified.has('2'), true)
  assert.deepEqual(verified.get('3'), [])
})
