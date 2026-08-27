import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('production adapts live agent, finance, and attorney contacts into one team model', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /buildBuyerTeamPresentationModel\(\{[\s\S]*?source: 'production'/)
  assert.match(source, /members: teamMembers/)
  assert.match(source, /attorneyRolePlayers: attorneyRolePlayerCards/)
  assert.match(source, /isTeam \? <BuyerTeamWorkspace model=\{buyerTeamPresentationModel\}/)
  assert.match(source, /teamMembers=\{buyerTeamPresentationModel\.members\}/)
  assert.doesNotMatch(source, /isTeam \? \([\s\S]{0,400}<AttorneyFirmRolePlayerCard/)
})

test('demo desktop, mobile, and messages support consume one reactive team model', async () => {
  const source = await read('src/pages/ProspectBuyerDemo.jsx')

  assert.match(source, /const buyerTeamModel = useMemo\(/)
  assert.match(source, /members: transactionTeam/)
  assert.match(source, /teamModel=\{buyerTeamModel\}/)
  assert.match(source, /<MobileTeam brand=\{brand\} model=\{teamModel\}/)
  assert.match(source, /return <BuyerTeamWorkspace model=\{model\} theme=\{brand\}/)
  assert.match(source, /activeSection === 'messages'[\s\S]*?<BuyerTeamWorkspace model=\{\{ \.\.\.teamModel, heading: 'Messages & support'/)
})

test('shared team files remain presentation-only boundaries', async () => {
  const [model, workspace] = await Promise.all([
    read('src/core/clientPortal/buyerTeamPresentationModel.js'),
    read('src/components/client-portal/team/BuyerTeamWorkspace.jsx'),
  ])

  assert.doesNotMatch(model, /services\/|supabase|fetch\(|localStorage|sessionStorage/)
  assert.doesNotMatch(workspace, /services\/|supabase|TRANSACTION_TEAM|attorneyRolePlayerCards/)
  assert.match(workspace, /data-buyer-team="workspace"/)
  assert.match(workspace, /data-team-member=\{member\.id\}/)
  assert.match(workspace, /data-contact-route=\{route\.key\}/)
})
