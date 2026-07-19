#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(repoRoot, 'docs/arch9-mvp-release-manifest.json')

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Git command failed').trim())
  return result.stdout.trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function isAllowedPath(filePath, manifest) {
  return manifest.allowedPaths.includes(filePath)
    || manifest.allowedPathPrefixes.some((prefix) => filePath.startsWith(prefix))
}

function splitGitPaths(output) {
  return output ? output.split('\n').map((entry) => entry.trim()).filter(Boolean) : []
}

function parseOptions(argv) {
  const options = { base: '', json: false, strict: false }
  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--strict') options.strict = true
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function collectWorktreePaths() {
  return unique([
    ...splitGitPaths(runGit(['diff', '--name-only'])),
    ...splitGitPaths(runGit(['diff', '--cached', '--name-only'])),
    ...splitGitPaths(runGit(['ls-files', '--others', '--exclude-standard'])),
  ])
}

function evaluateReleaseLane({ manifest, branch, committedPaths, worktreePaths }) {
  const requiredFilesMissing = manifest.requiredFiles.filter((filePath) => !existsSync(path.join(repoRoot, filePath)))
  const committedOutsideRelease = committedPaths.filter((filePath) => !isAllowedPath(filePath, manifest))
  const worktreeOutsideRelease = worktreePaths.filter((filePath) => !isAllowedPath(filePath, manifest))
  const releaseBranchMatches = new RegExp(manifest.releaseBranchPattern).test(branch)
  const blockers = []

  if (!releaseBranchMatches) blockers.push('not_on_dedicated_mvp_release_branch')
  if (requiredFilesMissing.length) blockers.push('required_mvp_release_assets_missing')
  if (committedOutsideRelease.length) blockers.push('committed_changes_outside_mvp_release_manifest')
  if (worktreePaths.length) blockers.push('worktree_contains_uncommitted_changes')

  return {
    version: 'arch9_mvp_release_lane_check_v1',
    decision: blockers.length ? 'no_go' : 'release_lane_ready',
    branch,
    baseBranch: manifest.baseBranch,
    monthlyTransactionLimit: manifest.monthlyTransactionLimit,
    supportedScenarios: manifest.supportedScenarios,
    deployBlockedUntil: manifest.deployBlockedUntil,
    blockers,
    requiredFilesMissing,
    committedPaths: {
      allowed: committedPaths.filter((filePath) => isAllowedPath(filePath, manifest)),
      outsideManifest: committedOutsideRelease,
    },
    worktreePaths: {
      allowedButUncommitted: worktreePaths.filter((filePath) => isAllowedPath(filePath, manifest)),
      outsideManifest: worktreeOutsideRelease,
    },
  }
}

function printReport(report) {
  console.log(`Decision: ${report.decision}`)
  console.log(`Branch: ${report.branch}`)
  console.log(`Base branch: ${report.baseBranch}`)
  console.log(`MVP operating limit: ${report.monthlyTransactionLimit} transactions/month`)
  console.log(`Scenarios: ${report.supportedScenarios.join(', ')}`)
  console.log(`Blockers: ${report.blockers.length ? report.blockers.join(', ') : 'none'}`)
  if (report.requiredFilesMissing.length) console.log(`Missing release assets: ${report.requiredFilesMissing.join(', ')}`)
  if (report.committedPaths.outsideManifest.length) console.log(`Committed paths outside manifest: ${report.committedPaths.outsideManifest.join(', ')}`)
  if (report.worktreePaths.allowedButUncommitted.length) console.log(`Approved but uncommitted paths: ${report.worktreePaths.allowedButUncommitted.join(', ')}`)
  if (report.worktreePaths.outsideManifest.length) console.log(`Unrelated worktree paths: ${report.worktreePaths.outsideManifest.join(', ')}`)
  console.log(`Deployment remains blocked until: ${report.deployBlockedUntil.join(', ')}`)
}

const options = parseOptions(process.argv.slice(2))
const manifest = readManifest()
const base = options.base || manifest.baseBranch
const branch = runGit(['branch', '--show-current'])
const mergeBase = runGit(['merge-base', base, 'HEAD'])
const committedPaths = splitGitPaths(runGit(['diff', '--name-only', `${mergeBase}..HEAD`]))
const worktreePaths = collectWorktreePaths()
const report = evaluateReleaseLane({ manifest, branch, committedPaths, worktreePaths })

if (options.json) console.log(JSON.stringify(report, null, 2))
else printReport(report)

if (options.strict && report.decision !== 'release_lane_ready') process.exit(1)
