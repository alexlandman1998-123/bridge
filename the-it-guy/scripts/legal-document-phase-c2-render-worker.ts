import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

const inputPath = Deno.args.find((value) => value.startsWith('--input='))?.slice(8) || ''
const outputPath = Deno.args.find((value) => value.startsWith('--output='))?.slice(9) || ''
if (!inputPath || !outputPath) throw new Error('C2 render worker requires --input and --output.')
const input = JSON.parse(await Deno.readTextFile(inputPath))
const source = await Deno.readFile(input.sourcePath)
const document = new Docxtemplater(new PizZip(source), {
  paragraphLoop: true,
  linebreaks: true,
  nullGetter(part) { return `[[C2_UNRESOLVED:${part.value}]]` },
})
document.render(input.placeholders || {})
const rendered = document.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
await Deno.writeFile(outputPath, rendered)
console.log(JSON.stringify({ status: 'rendered', byteLength: rendered.length }))
