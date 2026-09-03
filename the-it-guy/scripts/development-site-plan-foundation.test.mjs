import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const read = (path) => readFile(resolve(appRoot, path), 'utf8')

const [detailPage, availabilityWorkspace, desktopPublicPage, mobilePublicPage] = await Promise.all([
  read('src/pages/DevelopmentDetail.jsx'),
  read('src/components/developments/DevelopmentAvailabilityWorkspace.jsx'),
  read('src/pages/PublicDevelopmentLandingPage.jsx'),
  read('src/pages/MobilePublicDevelopmentExperience.jsx'),
])

assert.match(detailPage, /sitePlanUrl=\{marketingForm\.mediaLibrary\.sitePlanUrl \|\| marketingForm\.mediaLibrary\.masterplanUrl\}/)
assert.match(detailPage, /sitePlanMap=\{marketingForm\.mediaLibrary\.sitePlanMap\}/)
assert.match(detailPage, /sitePlanMap,\n\s*},/)
assert.match(detailPage, /handleAvailabilitySitePlanUpload\(event\)/)
assert.match(detailPage, /renderSitePlanPdfFirstPage\(sourceFile\)/)
assert.match(detailPage, /Original source PDF retained for this site plan/)
assert.match(detailPage, /nextMediaLibrary\.sitePlanUrl = urls\[0\] \|\| nextMediaLibrary\.sitePlanUrl/)

assert.match(availabilityWorkspace, /\[selectedUnit\.id\]: \{\n\s*x:/)
assert.match(availabilityWorkspace, /onSaveSitePlanMap\?\.\(/)
assert.match(availabilityWorkspace, /backgroundImage: sitePlanUrl/)
assert.match(availabilityWorkspace, /beginNextSitePlanPlacement/)
assert.match(availabilityWorkspace, /Place next \(\$\{unplacedUnits\[0\]\.displayNumber\}\)/)
assert.match(availabilityWorkspace, /sitePlanUrl \? visibleUnits\.filter\(\(unit\) => hasSavedMapPosition\(sitePlanMap, unit\.id\)\) : visibleUnits/)

assert.match(desktopPublicPage, /const map = media\.sitePlanMap \|\| \{\}/)
assert.match(desktopPublicPage, /media\.masterplanUrl \|\| media\.sitePlanUrl/)
assert.match(desktopPublicPage, /Number\.isFinite\(Number\(map\[unit\.id\]\?\.x\)\)/)
assert.match(mobilePublicPage, /const map = media\.sitePlanMap \|\| \{\}/)
assert.match(mobilePublicPage, /media\.masterplanUrl \|\| media\.sitePlanUrl/)
assert.match(mobilePublicPage, /Number\.isFinite\(Number\(map\[unit\.id\]\?\.x\)\)/)

console.log('development site-plan foundation contract checks passed')
