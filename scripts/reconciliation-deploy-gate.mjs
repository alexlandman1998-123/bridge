#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const passingCheckRunConclusions = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL'])

function parseArgs(argv) {
  const args = {
    allowDraft: false,
    pr: null,
    repo: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--allow-draft') {
      args.allowDraft = true
    } else if (arg === '--pr') {
      args.pr = argv[index + 1]
      index += 1
    } else if (arg === '--repo') {
      args.repo = argv[index + 1]
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (args.pr === '') throw new Error('--pr requires a PR number, branch, or URL')
  if (args.repo === '') throw new Error('--repo requires an owner/repo value')

  return args
}

function runGh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    shell: false,
  })

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh ${args.join(' ')} failed`
    throw new Error(detail)
  }

  return result.stdout
}

function viewPullRequest({ pr, repo }) {
  const args = ['pr', 'view']
  if (pr) args.push(pr)
  args.push(
    '--json',
    [
      'number',
      'title',
      'state',
      'isDraft',
      'url',
      'headRefName',
      'baseRefName',
      'mergeStateStatus',
      'statusCheckRollup',
    ].join(','),
  )
  if (repo) args.push('--repo', repo)

  return JSON.parse(runGh(args))
}

function checkName(check) {
  return check.name || check.context || check.workflowName || check.__typename || 'unnamed check'
}

function classifyCheck(check) {
  if (check.__typename === 'CheckRun') {
    if (check.status !== 'COMPLETED') {
      return {
        state: 'pending',
        detail: `${checkName(check)} is ${check.status || 'not completed'}`,
      }
    }

    if (passingCheckRunConclusions.has(check.conclusion)) {
      return {
        state: 'passed',
        detail: `${checkName(check)} ${check.conclusion.toLowerCase()}`,
      }
    }

    return {
      state: 'failed',
      detail: `${checkName(check)} concluded ${check.conclusion || 'without success'}`,
    }
  }

  if (check.__typename === 'StatusContext') {
    if (check.state === 'SUCCESS') {
      return {
        state: 'passed',
        detail: `${check.context} success`,
      }
    }

    if (check.state === 'PENDING') {
      return {
        state: 'pending',
        detail: `${check.context} is pending`,
      }
    }

    return {
      state: 'failed',
      detail: `${check.context} is ${check.state || 'not successful'}`,
    }
  }

  return {
    state: 'failed',
    detail: `${checkName(check)} has unsupported check type ${check.__typename || 'unknown'}`,
  }
}

function printUsage() {
  console.log('Usage: node scripts/reconciliation-deploy-gate.mjs [--repo owner/repo] [--pr number|branch|url] [--allow-draft]')
  console.log('')
  console.log('Fails closed unless the selected pull request is non-draft and every GitHub check/status context is green.')
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(error.message)
  printUsage()
  process.exit(1)
}

if (args.help) {
  printUsage()
  process.exit(0)
}

let pullRequest
try {
  pullRequest = viewPullRequest(args)
} catch (error) {
  console.error(`Deployment gate blocked: ${error.message}`)
  process.exit(1)
}

const checks = pullRequest.statusCheckRollup || []
const classified = checks.map((check) => classifyCheck(check))
const blockers = []

if (!pullRequest.number) blockers.push('pull request was not resolved')
if (pullRequest.state !== 'OPEN' && pullRequest.state !== 'MERGED') {
  blockers.push(`pull request state is ${pullRequest.state}`)
}
if (pullRequest.isDraft && !args.allowDraft) blockers.push('pull request is still draft')
if (checks.length === 0) blockers.push('no GitHub checks or status contexts were returned')

for (const check of classified) {
  if (check.state !== 'passed') blockers.push(check.detail)
}

console.log(`Deployment gate for PR #${pullRequest.number}: ${pullRequest.title}`)
console.log(pullRequest.url)
console.log(`Base: ${pullRequest.baseRefName}`)
console.log(`Head: ${pullRequest.headRefName}`)
console.log(`PR state: ${pullRequest.state}${pullRequest.isDraft ? ' draft' : ''}`)
console.log(`Merge state: ${pullRequest.mergeStateStatus || 'unknown'}`)

if (classified.length > 0) {
  console.log('')
  console.log('Check rollup:')
  for (const check of classified) {
    console.log(`- ${check.state.toUpperCase()}: ${check.detail}`)
  }
}

if (blockers.length > 0) {
  console.error('')
  console.error('Deployment gate blocked:')
  for (const blocker of blockers) console.error(`- ${blocker}`)
  process.exit(1)
}

console.log('')
console.log('Deployment gate passed: all PR checks are green.')
