import { DOCUMENT_GENERATOR_RETIRED_MESSAGE } from '../core/documents/documentGeneratorRetirement'

export default function RetiredDocumentGeneratorPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Document generator retired</h1>
      <p className="mt-4 text-sm leading-6">{DOCUMENT_GENERATOR_RETIRED_MESSAGE}</p>
    </main>
  )
}
