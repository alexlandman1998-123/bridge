#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageFiles = ['package.json', 'the-it-guy/package.json', 'apps/websites/package.json', 'apps/admin/package.json']
const generatedDirectoryNames = new Set(['node_modules', '.next', 'dist', 'build', '.vercel', '.vite', 'test-results'])
const largeChangeFileCount = 100
const largeChangeBytes = 1_000_000

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
}

function isGeneratedPath(filePath) {
  return filePath.split('/').some((part) => generatedDirectoryNames.has(part)) || filePath.endsWith('/.DS_Store') || filePath === '.DS_Store'
}

function statusPaths() {
  return git(['status', '--porcelain=v1', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .filter(Boolean)
}

function changedBytes() {
  const rows = [git(['diff', '--numstat']), git(['diff', '--cached', '--numstat'])]
    .flatMap((output) => output.split('\n'))
    .filter(Boolean)
  return rows.reduce((total, row) => {
    const [added, removed, filePath] = row.split('\t')
    if (isGeneratedPath(filePath || '')) return total
    const numeric = (value) => (value === '-' ? 0 : Number(value || 0))
    return total + numeric(added) + numeric(removed)
  }, 0)
}

function trackedGeneratedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean).filter(isGeneratedPath)
}

function nodeScriptPaths(command) {
  const targets = []
  for (const segment of command.split(/&&|\|\||;/)) {
    const tokens = segment.trim().split(/\s+/)
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] !== 'node') continue
      for (const token of tokens.slice(index + 1)) {
        if (token.startsWith('-')) continue
        const candidate = token.replace(/^['"]|['"]$/g, '')
        if (/\.(?:[cm]?js)$/i.test(candidate)) targets.push(candidate)
        break
      }
    }
  }
  return targets
}

function scriptInventory() {
  const missingTargets = []
  const phaseScriptCounts = []
  const duplicateCommands = []

  for (const packageFile of packageFiles) {
    const absolutePath = path.join(repoRoot, packageFile)
    if (!existsSync(absolutePath)) continue
    const packageDirectory = path.dirname(absolutePath)
    const scripts = JSON.parse(readFileSync(absolutePath, 'utf8')).scripts || {}
    const commandNames = new Map()
    let phaseCount = 0

    for (const [name, command] of Object.entries(scripts)) {
      if (/phase/i.test(name)) phaseCount += 1
      const names = commandNames.get(command) || []
      names.push(name)
      commandNames.set(command, names)

      for (const target of nodeScriptPaths(command)) {
        if (!target.startsWith('.') && !target.startsWith('scripts/') && !target.startsWith('src/') && !target.startsWith('server/')) continue
        if (!existsSync(path.resolve(packageDirectory, target))) missingTargets.push(`${packageFile}:${name} -> ${target}`)
      }
    }

    phaseScriptCounts.push({ packageFile, count: phaseCount })
    duplicateCommands.push(...[...commandNames.values()].filter((names) => names.length > 1).map((names) => `${packageFile}: ${names.join(', ')}`))
  }

  return { missingTargets, phaseScriptCounts, duplicateCommands }
}

function runQuickCheck(skipQuickCheck) {
  if (skipQuickCheck) return { skipped: true, ok: true }
  const result = spawnSync('npm', ['run', 'check:quick'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
  })
  return {
    skipped: false,
    ok: !result.error && result.status === 0,
    reason: result.error?.code === 'ETIMEDOUT' ? 'timed out after two minutes' : result.error?.message || result.stderr?.trim() || `exit code ${result.status}`,
  }
}

function main() {
  const skipQuickCheck = process.argv.slice(2).includes('--skip-quick-check')
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--skip-quick-check')
  if (unknownArguments.length) throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`)

  const dirtySourcePaths = statusPaths().filter((filePath) => !isGeneratedPath(filePath))
  const sourceBytes = changedBytes()
  const trackedGenerated = trackedGeneratedFiles()
  const inventory = scriptInventory()
  const quickCheck = runQuickCheck(skipQuickCheck)
  const warnings = []

  if (trackedGenerated.length) warnings.push(`${trackedGenerated.length} generated files are tracked by Git: ${trackedGenerated.slice(0, 3).join(', ')}${trackedGenerated.length > 3 ? ', …' : ''}`)
  if (dirtySourcePaths.length > largeChangeFileCount || sourceBytes > largeChangeBytes) {
    warnings.push(`Large uncommitted source change: ${dirtySourcePaths.length} files and ${sourceBytes.toLocaleString()} changed lines.`)
  }
  if (inventory.missingTargets.length) warnings.push(`${inventory.missingTargets.length} npm script target(s) no longer exist.`)
  if (!quickCheck.ok) warnings.push(`Fast check failed: ${quickCheck.reason}`)

  console.log(`Repository health: ${warnings.length ? 'ATTENTION' : 'HEALTHY'}`)
  for (const warning of warnings) console.log(`- ${warning}`)

  const highPhaseCounts = inventory.phaseScriptCounts.filter((entry) => entry.count >= 25)
  if (highPhaseCounts.length) {
    console.log(`- Maintenance candidate: phase-named scripts remain high (${highPhaseCounts.map((entry) => `${entry.packageFile}: ${entry.count}`).join('; ')}).`)
  }
  if (inventory.duplicateCommands.length) {
    console.log(`- Maintenance candidate: ${inventory.duplicateCommands.length} duplicate script command definition(s); review only when consolidating a workflow.`)
  }
  if (!warnings.length && !highPhaseCounts.length && !inventory.duplicateCommands.length) console.log('- No repository hygiene issues found.')

  if (trackedGenerated.length || inventory.missingTargets.length || !quickCheck.ok) process.exitCode = 1
}

main()
