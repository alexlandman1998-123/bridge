import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const overviewStart = source.indexOf("resolveBuyerWorkspaceTabKey(leadWorkspaceTab) === 'overview' && !selectedLeadIsSeller")
const overviewEnd = source.indexOf("resolveBuyerWorkspaceTabKey(leadWorkspaceTab) === 'legacy_overview'", overviewStart)

assert.ok(overviewStart > -1 && overviewEnd > overviewStart, 'Buyer overview block should be sliceable.')

const overviewBlock = source.slice(overviewStart, overviewEnd)
const layoutStart = overviewBlock.indexOf('className="grid items-stretch gap-5 xl:grid-cols-[minmax(460px,0.55fr)_minmax(0,0.45fr)]"')
const qualificationStart = overviewBlock.indexOf('Phone qualification questions', layoutStart)
const rightRailStart = overviewBlock.indexOf('className="flex min-w-0 self-stretch flex-col gap-4"', qualificationStart)
const whatsNextStart = overviewBlock.indexOf('What’s next', rightRailStart)
const activityLoggerStart = overviewBlock.indexOf('Activity Logger', whatsNextStart)
const activityLoggerSectionStart = overviewBlock.lastIndexOf('<section', activityLoggerStart)

assert.ok(layoutStart > -1, 'Buyer overview should stretch the two-column grid row so cards align vertically.')
assert.ok(qualificationStart > layoutStart, 'Buyer Qualification should remain in the left column of the overview grid.')
assert.match(
  overviewBlock.slice(layoutStart, rightRailStart),
  /<form className="flex h-full self-stretch flex-col rounded-\[20px\]/,
  'Buyer Qualification card should stretch to the height of the right-hand column.',
)
assert.ok(rightRailStart > qualificationStart, 'Right-hand rail should remain after Buyer Qualification.')
assert.ok(whatsNextStart > rightRailStart, 'What’s Next should remain at the top of the right-hand rail.')
assert.ok(activityLoggerStart > whatsNextStart, 'Activity Logger should sit below What’s Next in the right-hand rail.')
assert.ok(activityLoggerSectionStart > whatsNextStart, 'Activity Logger section should be sliceable.')
assert.match(
  overviewBlock.slice(activityLoggerSectionStart, activityLoggerStart),
  /<section className="flex w-full flex-col rounded-\[20px\]/,
  'Activity Logger should fill the right-hand rail width instead of self-starting.',
)
assert.doesNotMatch(
  overviewBlock.slice(layoutStart, activityLoggerStart),
  /grid items-start gap-5|flex min-w-0 flex-col gap-4 self-start/,
  'Buyer overview should not use the previous self-start layout for the main grid or right rail.',
)

console.log('Buyer overview layout alignment contract passed.')
