#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const SOURCE = 'lwp.co.za'
const SOURCE_ROOT = 'https://www.lwp.co.za'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function decode(value = '') {
  return String(value).replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"')
}

function normalizePhone(value = '') {
  const compact = String(value).replace(/\s+/g, '').trim()
  if (!compact) return null
  return compact.startsWith('+') ? compact : `+${compact}`
}

function nameParts(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] || 'LWP', lastName: parts.slice(1).join(' ') || null }
}

function agentCards(html, page) {
  return html.split(/(?=<div data-id=")/).slice(1).flatMap((card) => {
    const sourceAgentId = card.match(/^<div data-id="([^"]+)"/)?.[1]
    const fullName = decode(card.match(/data-name="([^"]+)"/)?.[1] || '').trim()
    const avatarUrl = decode(card.match(/<a class="top-img"[\s\S]*?<img src="([^"]+)"/)?.[1] || '').trim()
    const jobTitle = decode(card.match(/<span class="info-designation">\s*([^<]+?)\s*<\//)?.[1] || '').trim()
    const whatsappNumber = normalizePhone(decode(card.match(/https:\/\/wa\.me\/([^"?]+)/)?.[1] || ''))
    const sourcePath = card.match(/<a class="top-img" href="([^"]+)"/)?.[1] || ''
    if (!sourceAgentId || !fullName || !avatarUrl || !sourcePath) return []
    const { firstName, lastName } = nameParts(fullName)
    return [{
      source_agent_id: sourceAgentId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      job_title: jobTitle || 'Property practitioner',
      phone_number: whatsappNumber,
      whatsapp_number: whatsappNumber,
      avatar_url: avatarUrl,
      source_profile_url: new URL(sourcePath, SOURCE_ROOT).toString(),
    }]
  })
}

async function fetchAgents() {
  const firstResponse = await fetch(`${SOURCE_ROOT}/agents/`, { headers: { 'User-Agent': 'Arch9 LWP roster importer/1.0' } })
  if (!firstResponse.ok) throw new Error(`LWP agent directory returned HTTP ${firstResponse.status}.`)
  const firstPage = await firstResponse.text()
  const pages = [...new Set([1, ...[...firstPage.matchAll(/[?&]page=(\d+)/g)].map((match) => Number(match[1]))])].sort((a, b) => a - b)
  const htmlByPage = new Map([[1, firstPage]])
  await Promise.all(pages.filter((page) => page !== 1).map(async (page) => {
    const response = await fetch(`${SOURCE_ROOT}/agents/?page=${page}`, { headers: { 'User-Agent': 'Arch9 LWP roster importer/1.0' } })
    if (!response.ok) throw new Error(`LWP agent directory page ${page} returned HTTP ${response.status}.`)
    htmlByPage.set(page, await response.text())
  }))
  const agents = pages.flatMap((page) => agentCards(htmlByPage.get(page) || '', page))
  const unique = new Map(agents.map((agent) => [agent.source_agent_id, agent]))
  return [...unique.values()].sort((left, right) => left.full_name.localeCompare(right.full_name))
}

async function main() {
  const organisationId = argument('--organisation-id')
  const apply = hasFlag('--apply')
  const sql = hasFlag('--sql')
  if (!organisationId) throw new Error('Pass the target with --organisation-id <UUID>.')

  const agents = await fetchAgents()
  if (!agents.length) throw new Error('No LWP agents were found; no changes were made.')

  const rows = agents.map((agent, index) => ({
    organisation_id: organisationId,
    source: SOURCE,
    ...agent,
    sort_order: index,
    is_public: true,
    status: 'active',
    source_synced_at: new Date().toISOString(),
  }))
  const summary = {
    organisationId,
    source: SOURCE,
    agentsFound: agents.length,
    profileImagesFound: agents.filter((agent) => agent.avatar_url).length,
    mode: apply ? 'apply' : 'dry-run',
  }
  if (sql) {
    const values = JSON.stringify(rows).replaceAll("'", "''")
    console.log(`insert into public.agency_public_agents (organisation_id, source, source_agent_id, first_name, last_name, full_name, job_title, phone_number, whatsapp_number, avatar_url, source_profile_url, sort_order, is_public, status, source_synced_at) select organisation_id::uuid, source, source_agent_id, first_name, last_name, full_name, job_title, phone_number, whatsapp_number, avatar_url, source_profile_url, sort_order, is_public, status, source_synced_at::timestamptz from jsonb_to_recordset('${values}'::jsonb) as agent(organisation_id text, source text, source_agent_id text, first_name text, last_name text, full_name text, job_title text, phone_number text, whatsapp_number text, avatar_url text, source_profile_url text, sort_order integer, is_public boolean, status text, source_synced_at text) on conflict (organisation_id, source, source_agent_id) do update set first_name = excluded.first_name, last_name = excluded.last_name, full_name = excluded.full_name, job_title = excluded.job_title, phone_number = excluded.phone_number, whatsapp_number = excluded.whatsapp_number, avatar_url = excluded.avatar_url, source_profile_url = excluded.source_profile_url, sort_order = excluded.sort_order, is_public = excluded.is_public, status = excluded.status, source_synced_at = excluded.source_synced_at;`)
    return
  }
  if (!apply) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply.')

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await supabase
    .from('agency_public_agents')
    .upsert(rows, { onConflict: 'organisation_id,source,source_agent_id' })
  if (error) throw error

  console.log(JSON.stringify({ ...summary, imported: rows.length }, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
