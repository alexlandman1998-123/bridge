import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const templatePath = path.resolve('templates/legal/kingstons-2026-otp-canonical-v1.docx')
const manifestPath = path.resolve('templates/legal/kingstons-2026-otp-canonical-v1.manifest.json')
assert.ok(fs.existsSync(templatePath), 'canonical OTP DOCX must exist')
assert.ok(fs.existsSync(manifestPath), 'canonical OTP manifest must exist')

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const xml = execFileSync('unzip', ['-p', templatePath, 'word/document.xml'], { encoding: 'utf8' })
const declaredTokens = manifest.fields.flatMap((field) => field.slots.map((slot) => slot.token))
const uniqueTokens = [...new Set(declaredTokens)]
for (const token of uniqueTokens) {
  assert.ok(xml.includes(`{${token}}`), `template is missing {${token}}`)
}

assert.equal(manifest.fields.length, 84)
assert.equal(manifest.fields.filter((field) => field.legalText).length, 2)
assert.equal(manifest.editablePackageParts.join(','), 'word/document.xml')
assert.equal(manifest.emptyValuePolicy, 'blank_preserve_layout')
assert.ok(manifest.fields.every((field) => field.outputFormat?.kind))
assert.ok(manifest.fields.every((field) => field.emptyValuePolicy === 'blank_preserve_layout'))
assert.match(crypto.createHash('sha256').update(fs.readFileSync(templatePath)).digest('hex'), /^[a-f0-9]{64}$/)

console.log(`Canonical OTP Phase 3 artifact passed with ${uniqueTokens.length} unique placeholders.`)
