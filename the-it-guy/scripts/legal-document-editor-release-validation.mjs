import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const validations = [
  {
    name: 'behavioral contracts',
    args: [
      '--test',
      'src/components/legal-documents/__tests__/legalDocumentEditorLayout.test.js',
      'src/core/documents/__tests__/legalDocumentRoutes.test.js',
      'src/core/documents/__tests__/legalDocumentEditorScope.test.js',
      'src/core/documents/__tests__/legalDocumentEditorProtection.test.js',
      'src/core/documents/__tests__/legalDocumentLibraryModel.test.js',
    ],
  },
  { name: 'phase2 declutter', args: ['scripts/legal-document-editor-declutter-phase2.test.mjs'] },
  { name: 'phase3 focused conditional editing', args: ['scripts/legal-document-focused-conditional-editing-phase3.test.mjs'] },
  { name: 'phase4 simplified layout', args: ['scripts/legal-document-simplified-editor-layout-phase4.test.mjs'] },
  { name: 'phase5 component cleanup', args: ['scripts/legal-document-editor-component-cleanup-phase5.test.mjs'] },
  { name: 'conditional protection compatibility', args: ['scripts/legal-document-conditional-section-editor-phase5.test.mjs'] },
  { name: 'safe migration compatibility', args: ['scripts/legal-document-safe-migration-phase10.test.mjs'] },
  {
    name: 'focused editor lint',
    command: npmCommand,
    args: [
      'exec',
      '--',
      'eslint',
      'src/components/legal-documents/LegalDocumentEditorContextPanel.jsx',
      'src/components/legal-documents/TemplateEditorActionBar.jsx',
      'src/components/legal-documents/legalDocumentEditorLayout.js',
      'src/pages/settings/LegalDocumentEditorRoute.jsx',
      'src/pages/settings/SettingsSigningTemplatesPage.jsx',
      'scripts/legal-document-editor-component-cleanup-phase5.test.mjs',
      'scripts/legal-document-editor-release-validation.mjs',
    ],
  },
  { name: 'production build', command: npmCommand, args: ['run', 'build'] },
]

for (const validation of validations) {
  const result = spawnSync(validation.command || process.execPath, validation.args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    process.stderr.write(`Release validation failed: ${validation.name}.\n`)
    process.exit(result.status || 1)
  }
}

process.stdout.write('Legal-document editor release validation passed.\n')
