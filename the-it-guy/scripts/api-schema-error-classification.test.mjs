import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../src/lib/api.js',import.meta.url),'utf8')
const load=name=>new Function(`return (${source.match(new RegExp(`function ${name}\\([^]*?\\n}`))[0]})`)()
const table=load('isMissingTableError'),fn=load('isMissingFunctionError'),relationship=load('isMissingRelationshipError')
for(const code of ['PGRST002','57014','42501']) {
 const error={code,status:503,message:'Could not query the database for the schema cache. Retrying.'}
 assert.equal(table(error,'client_portal_links'),false)
 assert.equal(fn(error),false)
 assert.equal(relationship(error),false)
}
assert.equal(table({code:'PGRST204',status:404,message:"Could not find column client_portal_links.expires_at in the schema cache"},'client_portal_links'),false)
assert.equal(table({code:'PGRST205',message:'Could not find table client_portal_links in the schema cache'},'client_portal_links'),true)
assert.equal(fn({code:'PGRST202',message:'Function bridge_test is not in the schema cache'},'bridge_test'),true)
assert.equal(relationship({code:'PGRST200',message:'Could not find a relationship'}),true)
console.log('API error classification: transient cache failures, timeouts and denial retain their identity; actual missing contracts are classified separately.')
