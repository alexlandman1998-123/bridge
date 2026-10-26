import DOMPurify from 'dompurify'

export function safeEmailDocument(html) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p','br','div','span','b','strong','i','em','u','s','blockquote','ul','ol','li','table','thead','tbody','tr','td','th','hr','h1','h2','h3','h4','a','pre','code'],
    ALLOWED_ATTR: ['href','title','colspan','rowspan'], ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  })
  // No images, scripts, forms or remote resources; links stay inside a sandbox
  // without navigation capabilities. Plain text is also always available.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:14px/1.6 system-ui;color:#192c3d;overflow-wrap:anywhere;margin:12px}table{max-width:100%;border-collapse:collapse}td,th{padding:4px}pre{white-space:pre-wrap}a{color:#17645b}</style></head><body>${clean}</body></html>`
}
