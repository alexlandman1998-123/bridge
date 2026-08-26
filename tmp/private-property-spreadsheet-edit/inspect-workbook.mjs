import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const inputPath = '/Users/alexanderlandman/Downloads/Arch9 Sandbox Testing Commands-2.xlsx'
const input = await FileBlob.load(inputPath)
const workbook = await SpreadsheetFile.importXlsx(input)

const overview = await workbook.inspect({
  kind: 'workbook,sheet,table',
  tableMaxRows: 40,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
  maxChars: 20000,
})
console.log(overview.ndjson)

const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 4000 })
console.log(sheets.ndjson)
