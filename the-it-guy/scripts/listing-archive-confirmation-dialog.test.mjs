import fs from 'node:fs'
import path from 'node:path'

const sourcePath = path.join(process.cwd(), 'src/pages/AgentListingDetail.jsx')
const source = fs.readFileSync(sourcePath, 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const archiveHandler = source.match(
  /async function archiveListingFromMarketing\(\)[\s\S]*?\n  }\n\n  async function prepareAgencyWebsiteListing/,
)?.[0] || ''

assert(
  source.includes('const [archiveListingDialogOpen, setArchiveListingDialogOpen] = useState(false)') &&
    source.includes('function requestArchiveListing()') &&
    source.includes('function closeArchiveListingDialog()') &&
    source.includes('onClick={requestArchiveListing}') &&
    source.includes('open={archiveListingDialogOpen}') &&
    source.includes('title="Expire and archive listing?"'),
  'listing expiry must use an in-app confirmation modal before archiving.',
)

assert(
  !archiveHandler.includes('window.confirm(') &&
    archiveHandler.includes("callProperty24ListingAction('status-update'") &&
    archiveHandler.includes("callPrivatePropertyListingAction('status-update'") &&
    archiveHandler.includes("listingVisibility: 'archived'"),
  'confirming the in-app dialog must retain the existing channel expiry and archive workflow.',
)

console.log('listing-archive-confirmation-dialog tests passed')
