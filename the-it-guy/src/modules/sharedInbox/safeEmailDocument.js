import DOMPurify from 'dompurify'

export function safeEmailDocument(html, { loadRemoteImages = false, inlineImages = {} } = {}) {
  const purifier = DOMPurify(window)
  purifier.addHook('afterSanitizeAttributes', node => {
    if (node.tagName !== 'IMG') return
    const source = node.getAttribute('src') || ''
    const cid = source.replace(/^cid:/i, '').replace(/^<|>$/g, '')
    const inline = /^cid:/i.test(source) ? inlineImages[cid] : null
    if (inline && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(inline)) node.setAttribute('src', inline)
    else if (!(loadRemoteImages && /^https:\/\//i.test(source))) node.remove()
    node.setAttribute('referrerpolicy', 'no-referrer')
    node.setAttribute('loading', 'lazy')
  })
  const clean = purifier.sanitize(html, {
    ALLOWED_TAGS: ['img','p','br','div','span','b','strong','i','em','u','s','blockquote','ul','ol','li','table','thead','tbody','tr','td','th','hr','h1','h2','h3','h4','a','pre','code'],
    ALLOWED_ATTR: ['src','alt','width','height','href','title','colspan','rowspan'], ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|cid:)/i,
  })
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:${loadRemoteImages ? ' https:' : ''}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:14px/1.6 system-ui;color:#192c3d;overflow-wrap:anywhere;margin:12px}#mail-content{display:flow-root}img{max-width:100%;height:auto}img:not([src]){display:none}table{max-width:100%;border-collapse:collapse}td,th{padding:4px}pre{white-space:pre-wrap}a{color:#17645b}</style></head><body><div id="mail-content">${clean}</div></body></html>`
}
