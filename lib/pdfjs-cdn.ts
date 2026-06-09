// Browser-side PDF.js loader. Lazy-imports the ESM build from a CDN so the
// build pipeline doesn't need pdfjs-dist or pdf-parse in node_modules. The
// import is marked `webpackIgnore` so Next.js skips it during bundling and
// leaves the dynamic import URL alone for the browser to resolve at runtime.
//
// Version is pinned to avoid silent breakage from CDN-side updates.

const PDFJS_VERSION = '4.0.379'
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

let cached: any = null

export async function loadPdfJsFromCdn(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('loadPdfJsFromCdn must run in the browser')
  }
  if (cached) return cached
  const lib: any = await import(/* webpackIgnore: true */ `${PDFJS_BASE}/pdf.min.mjs`)
  // Workers can't be cross-origin-imported the same way, so point pdfjs at
  // the CDN-hosted worker file directly. The library handles fetching it.
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`
  cached = lib
  return cached
}

// Extracts plain text from one PDF File via the CDN-loaded PDF.js instance.
// Concatenates every page's text items with double newlines between pages,
// mirroring what pdf-parse used to produce on the server.
async function extractOnePdf(pdfjs: any, file: File): Promise<string> {
  const arrayBuf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise
  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
      .join(' ')
    pageTexts.push(pageText)
  }
  return pageTexts.join('\n\n').trim()
}

// Extracts plain text from one or more PDF Files. With a single file the
// extracted text is returned as-is (same shape pdf-parse used to produce).
// With multiple files each document is wrapped with `--- FILE: name ---`
// markers so the extractor agent can tell where one source ends and the
// next begins.
export async function extractPdfTextsInBrowser(files: File[]): Promise<string> {
  if (files.length === 0) return ''
  const pdfjs = await loadPdfJsFromCdn()

  if (files.length === 1) {
    return extractOnePdf(pdfjs, files[0])
  }

  const parts: string[] = []
  for (const file of files) {
    const text = await extractOnePdf(pdfjs, file)
    parts.push(`--- FILE: ${file.name} ---\n\n${text}\n\n--- END FILE: ${file.name} ---`)
  }
  return parts.join('\n\n').trim()
}
