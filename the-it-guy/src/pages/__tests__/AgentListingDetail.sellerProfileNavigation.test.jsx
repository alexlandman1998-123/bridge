// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import React, { useState } from 'react'
import { flushSync } from 'react-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Button from '../../components/ui/Button.jsx'

// Render the actual workspace controls without its unrelated authenticated data reads.
const source = readFileSync(`${process.cwd()}/src/pages/AgentListingDetail.jsx`, 'utf8')
const start = source.indexOf('{sellerProfileBuilderStep < 3 ? (')
const end = source.indexOf('\n            </div>', start)
if (start < 0 || end < 0) throw new Error('Seller profile navigation controls were not found.')
const code = execFileSync(process.execPath, ['--input-type=module', '-e',
  "import {readFileSync} from 'node:fs'; import {transformSync} from 'esbuild'; process.stdout.write(transformSync(readFileSync(0,'utf8'),{loader:'jsx',format:'cjs',jsx:'transform'}).code)"], {
  input: `export default function Navigation({ sellerProfileBuilderStep, advanceSellerProfileBuilder,
    sellerProfileBuilderSaving = false, sellerOwnershipUnidentified = false }) { return <>${source.slice(start, end)}</> }`,
  encoding: 'utf8',
})
const module = { exports: {} }
const Navigation = new Function('module', 'exports', 'React', 'Button', `${code}; return module.exports.default`)(module, module.exports, React, Button)

afterEach(cleanup)

test('Continue opens the final property step without saving, then explicit Save submits once', () => {
  const save = vi.fn()
  function Editor() {
    const [step, setStep] = useState(1)
    return <>
      <form id="listing-seller-profile-builder-form" onSubmit={event => { event.preventDefault(); save() }}>
        <p>Step {step}</p>
      </form>
      <Navigation sellerProfileBuilderStep={step} advanceSellerProfileBuilder={() => {
        // Native click activation runs after the discrete React update commits.
        flushSync(() => setStep(previous => previous + 1))
      }} />
    </>
  }
  render(<Editor />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByText('Step 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByText('Step 3')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save Seller Profile' }))
  expect(save).toHaveBeenCalledTimes(1)
})
