import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const openPickerStart = source.indexOf('function openBuyerOtpUploadPicker')
const openPickerEnd = source.indexOf('function openBuyerOtpAttorneyOfRecordPrompt', openPickerStart)
assert.ok(openPickerStart > -1 && openPickerEnd > openPickerStart, 'OTP upload picker handler should be sliceable.')

const openPickerBlock = source.slice(openPickerStart, openPickerEnd)

assert.match(openPickerBlock, /buyerOtpUploadInputRef\.current\?\.click\(\)/, 'Upload action should open the file picker first.')
assert.doesNotMatch(openPickerBlock, /setBuyerOtpAttorneyPromptOpen\(true\)/, 'Upload action should not show the attorney modal before a file is selected.')

const uploadHandlerStart = source.indexOf('async function handleUploadBuyerOfferDocument')
const uploadHandlerEnd = source.indexOf('function openSelectedLeadOtpEditor', uploadHandlerStart)
assert.ok(uploadHandlerStart > -1 && uploadHandlerEnd > uploadHandlerStart, 'OTP upload handler should be sliceable.')

const uploadHandlerBlock = source.slice(uploadHandlerStart, uploadHandlerEnd)

assert.match(uploadHandlerBlock, /event\?\.pendingFile \|\| event\?\.file \|\| event\?\.target\?\.files\?\.\[0\]/, 'Upload handler should support a pending file after attorney confirmation.')
assert.match(uploadHandlerBlock, /buyerOtpPendingUploadFileRef\.current = file[\s\S]*openBuyerOtpAttorneyOfRecordPrompt\(\)[\s\S]*return/, 'Kingstons upload should pause after file selection and open the attorney-of-record modal.')
assert.match(uploadHandlerBlock, /providedAttorneyInstructionContext = event\?\.attorneyInstructionContext \|\| null/, 'Upload handler should accept the confirmed attorney instruction context.')
assert.match(uploadHandlerBlock, /attorneyInstructionRequested: otpAttorneyInstructionContext\?\.sendInstruction === true/, 'OTP document metadata should persist the instruction decision.')
assert.match(uploadHandlerBlock, /instructPrivateListingTransferAttorneyAllocation/, 'Confirmed instruction should call the transfer attorney instruction action.')
assert.match(uploadHandlerBlock, /source: 'buyer_otp_upload_prompt'/, 'Attorney instruction should remain traceable to the OTP upload prompt.')

const continuePromptStart = source.indexOf('function continueBuyerOtpUploadAfterAttorneyPrompt')
const continuePromptEnd = source.indexOf('async function handleUploadBuyerOfferDocument', continuePromptStart)
assert.ok(continuePromptStart > -1 && continuePromptEnd > continuePromptStart, 'Attorney modal continuation should be sliceable.')

const continuePromptBlock = source.slice(continuePromptStart, continuePromptEnd)

assert.match(continuePromptBlock, /const pendingFile = buyerOtpPendingUploadFileRef\.current/, 'Attorney confirmation should resume the selected pending file.')
assert.match(continuePromptBlock, /handleUploadBuyerOfferDocument\(\{\s*pendingFile,\s*attorneyInstructionContext,\s*\}\)/, 'Attorney confirmation should upload the pending file with the confirmed context.')
assert.match(continuePromptBlock, /buyerOtpPendingUploadFileRef\.current = null/, 'Pending upload file should be cleared after confirmation.')

const modalTestIdIndex = source.indexOf('data-testid="buyer-otp-attorney-of-record-modal"')
const modalStart = source.lastIndexOf('<Modal', modalTestIdIndex)
const modalEnd = source.indexOf('<Modal', modalTestIdIndex + 1)
assert.ok(modalTestIdIndex > -1 && modalStart > -1 && modalEnd > modalStart, 'Attorney of record modal should be sliceable.')

const modalBlock = source.slice(modalStart, modalEnd)

assert.match(modalBlock, /title="Attorney of record"/, 'Modal should ask for the attorney of record.')
assert.match(modalBlock, /Confirm who the attorney of record is and whether Arch9 should send the transfer instruction/, 'Modal subtitle should state both decisions.')
assert.match(modalBlock, /Can we send the instruction\?/, 'Modal should expose the instruction decision as a clear question.')
assert.match(modalBlock, /Upload OTP & Send Instruction/, 'Modal primary action should name the send-instruction path.')
assert.match(modalBlock, /Upload OTP Without Instruction/, 'Modal primary action should name the no-instruction path.')

console.log('Buyer Onboarding / OTP Phase 3 attorney instruction contract passed.')
