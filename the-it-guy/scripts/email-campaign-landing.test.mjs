import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('../src/components/marketing/EmailCampaigns.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/pages/EmailCampaigns.css', import.meta.url), 'utf8')

for (const marker of [
  'Email campaigns',
  'Create, schedule and measure campaigns that keep your audience moving.',
  'email-campaign-table',
  "['all', 'draft', 'scheduled', 'sending', 'sent', 'failed']",
  'PerformanceOverview',
  'Open rates are indicative, as privacy tools can affect open tracking.',
  'TOP PERFORMING CAMPAIGNS',
  'DELIVERABILITY CONTROL',
  'Verify your sender domain to improve deliverability and ensure emails reach the inbox.',
  'Email credits and campaign usage',
  'No charges have been applied yet.',
]) assert.ok(component.includes(marker), `Email landing should include ${marker}.`)

assert.ok(!component.includes('Billing adapter:'), 'The customer-facing landing must not expose adapter implementation details.')
assert.ok(component.indexOf('email-campaigns-panel') < component.indexOf('<PerformanceOverview'), 'Campaigns must lead the landing page.')
for (const marker of ['.email-landing', '.email-campaign-table', '.email-performance-grid', '.email-campaign-status-sending']) assert.ok(styles.includes(marker), `Landing styles should include ${marker}.`)

console.log('email campaign landing checks passed')
