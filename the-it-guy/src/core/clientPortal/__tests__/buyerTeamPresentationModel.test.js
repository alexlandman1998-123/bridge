import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerTeamPresentationModel } from '../buyerTeamPresentationModel.js'

test('normalizes buyer contacts and routes common questions to the right role', () => {
  const model = buildBuyerTeamPresentationModel({
    source: 'demo',
    members: [
      { id: 'agent', name: 'Sarah Williams', role: 'Buyer Agent', email: 'sarah@example.com', isMainContact: true },
      { id: 'originator', name: 'James Meyer', role: 'Bond Originator', email: 'james@example.com' },
      { id: 'attorney', name: 'Lebo Nkosi', role: 'Transfer Attorney', phone: '+27110000000', isActive: true },
    ],
  })

  assert.equal(model.mainContact.id, 'agent')
  assert.equal(model.activeMember.id, 'attorney')
  assert.equal(model.routes.find((route) => route.key === 'finance').member.id, 'originator')
  assert.equal(model.routes.find((route) => route.key === 'legal').member.id, 'attorney')
  assert.equal(model.contactableCount, 3)
})

test('adapts attorney role-player records without leaking the production shape to the UI', () => {
  const model = buildBuyerTeamPresentationModel({
    source: 'production',
    members: [{ name: 'Agency Team', title: 'Sales Team', email: 'sales@example.com' }],
    attorneyRolePlayers: [{
      key: 'transfer',
      label: 'Transfer Attorney',
      value: {
        status: 'active',
        firm: { name: 'Tuckers', email: 'legal@example.com' },
        attorneyUser: { name: 'Mia Dlamini' },
        secretary: { name: 'Lerato Molefe' },
      },
    }],
  })

  assert.equal(model.members.length, 3)
  assert.equal(model.members[1].organisation, 'Tuckers')
  assert.equal(model.members[2].category, 'documents')
  assert.equal(model.routes.find((route) => route.key === 'documents').member.name, 'Lerato Molefe')
})

test('returns a safe empty presentation when no team has been assigned', () => {
  const model = buildBuyerTeamPresentationModel({ source: 'production' })
  assert.equal(model.isEmpty, true)
  assert.equal(model.mainContact, null)
  assert.deepEqual(model.routes, [])
})
