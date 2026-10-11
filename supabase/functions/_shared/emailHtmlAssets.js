import { parse, parseFragment } from 'parse5'
import { escapeHtml } from './emailDocument.js'

// Include Outlook conditional fragments while retaining offsets into the
// original HTML. Returning false skips a node's children.
export function visitEmailHtml(html, visit) {
  const source = String(html)
  const root = parse(source, { sourceCodeLocationInfo: true })
  const stack = [{ node: root, source, offset: 0, depth: 0 }]
  while (stack.length) {
    const item = stack.pop()
    const { node, source, offset, depth } = item
    if (visit(node, { source, offset, depth }) === false) continue
    if (node.nodeName === '#comment' && /^\s*\[if\b/i.test(node.data)) {
      if (depth >= 4) throw new Error('Simplify the nested Outlook conditional markup before sending.')
      const start = node.data.indexOf('>') + 1
      const end = node.data.toLowerCase().lastIndexOf('<![endif]')
      if (start > 0 && end > start) {
        const inner = node.data.slice(start, end)
        stack.push({ node: parseFragment(inner, { sourceCodeLocationInfo: true }), source: inner, offset: offset + node.sourceCodeLocation.startOffset + 4 + start, depth: depth + 1 })
      }
    }
    const children = [...(node.childNodes || []), ...(node.content ? [node.content] : [])]
    for (const child of children.reverse()) stack.push({ node: child, source, offset, depth })
  }
  return root
}

export function packagePath(value) {
  const path = String(value || '').replace(/\\/g, '/')
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0')) throw new Error('Email file paths must stay inside the package.')
  const parts = path.split('/').filter((part) => part && part !== '.')
  if (parts.includes('..') || !parts.length) throw new Error('Email file paths must stay inside the package.')
  return parts.join('/')
}

function referencePath(value, htmlPath) {
  const raw = value.trim()
  if (/^(https?:)?\/\//i.test(raw)) return { kind: 'external', value: raw }
  if (!raw || raw.startsWith('#') || /^[a-z][\w+.-]*:/i.test(raw) || /[{}]/.test(raw)) return { kind: 'unsupported', value: raw }
  const split = raw.search(/[?#]/)
  const urlPath = split < 0 ? raw : raw.slice(0, split)
  let decoded
  try { decoded = decodeURIComponent(urlPath).replace(/\\/g, '/') } catch { return { kind: 'unsupported', value: raw } }
  if (decoded.startsWith('/') || /^[a-z]:/i.test(decoded) || decoded.includes('\0')) return { kind: 'unsupported', value: raw }
  const parts = htmlPath.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return { kind: 'unsupported', value: raw }; parts.pop() } else parts.push(part)
  }
  return { kind: 'local', value: raw, path: parts.join('/'), suffix: split < 0 ? '' : raw.slice(split) }
}

const cssTokens = /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\burl\s*\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\[\s\S]|[^)\\])*?))\s*\)/gi
const decodeCss = (value) => value.replace(/\\(?:([\da-f]{1,6})\s?|([^\r\n]))/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : char)

function cssUrls(value, resolve) {
  return value.replace(cssTokens, (match, double, single, unquoted) => {
    const raw = double ?? single ?? unquoted
    if (raw === undefined) return match
    const next = resolve(decodeCss(raw.trim()))
    return next === null ? match : `url("${next.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
  })
}

function srcsetUrls(value, resolve) {
  // URL tokens end at whitespace; internal commas are valid URL characters.
  const edits = []
  let position = 0
  while (position < value.length) {
    while (/[\s,]/.test(value[position] || '') && position < value.length) position++
    const start = position
    while (position < value.length && !/\s/.test(value[position])) position++
    const token = value.slice(start, position)
    const url = token.replace(/,+$/, '')
    if (!url) break
    const next = resolve(url)
    if (next !== null) edits.push({ start, end: start + url.length, value: next })
    if (token.endsWith(',')) continue
    let parentheses = 0
    while (position < value.length) {
      const char = value[position++]
      if (char === '(') parentheses++
      if (char === ')') parentheses--
      if (char === ',' && parentheses === 0) break
    }
  }
  for (const edit of edits.reverse()) value = value.slice(0, edit.start) + edit.value + value.slice(edit.end)
  return value
}

// Change only located URL attributes/CSS tokens. Do not serialize the DOM:
// Outlook conditional markup, table layout and the designer's source stay intact.
export function rewriteEmailAssets(html, { htmlPath = 'email.html', resolve = () => null, keepSuffix = true } = {}) {
  const references = []
  const problems = []
  const edits = []
  const rewrite = (value) => {
    const reference = referencePath(value, htmlPath)
    references.push(reference)
    if (reference.kind === 'unsupported') return null
    if (reference.kind === 'external') return value.startsWith('//') ? `https:${value}` : null
    const hosted = resolve(reference.path, reference)
    return hosted ? `${hosted}${keepSuffix ? reference.suffix : ''}` : null
  }
  const walk = (node, source, offset = 0, depth = 0) => {
    const location = node.sourceCodeLocation
    if (node.nodeName === '#comment' && /^\s*\[if\b/i.test(node.data) && depth < 4) {
      const start = node.data.indexOf('>') + 1
      const end = node.data.toLowerCase().lastIndexOf('<![endif]')
      if (start > 0 && end > start) {
        const inner = node.data.slice(start, end)
        walk(parseFragment(inner, { sourceCodeLocationInfo: true }), inner, offset + location.startOffset + 4 + start, depth + 1)
      }
    }
    if (node.tagName === 'base') problems.push('Remove the base URL from the HTML export and use explicit file paths.')
    for (const attribute of node.attrs || []) {
      const attrLocation = location?.attrs?.[attribute.name]
      if (!attrLocation) continue
      const name = attribute.name.toLowerCase()
      let next = attribute.value
      if ((name === 'src' && ['img', 'input', 'v:image', 'v:fill', 'v:imagedata'].includes(node.tagName)) || name === 'background') {
        next = rewrite(attribute.value) ?? attribute.value
      } else if (name === 'srcset' && ['img', 'source'].includes(node.tagName)) {
        if (/\bdata:/i.test(attribute.value)) problems.push('Export embedded srcset images as separate image files.')
        else next = srcsetUrls(attribute.value, rewrite)
      } else if (name === 'style') next = cssUrls(attribute.value, rewrite)
      if (node.tagName === 'link' && name === 'href' && node.attrs.some((attr) => attr.name === 'rel' && /stylesheet/i.test(attr.value)) && referencePath(attribute.value, htmlPath).kind !== 'external') {
        problems.push('Ask the designer to inline the local stylesheet before importing this email.')
      }
      if (next !== attribute.value) {
        const raw = source.slice(attrLocation.startOffset, attrLocation.endOffset)
        edits.push({ start: offset + attrLocation.startOffset, end: offset + attrLocation.endOffset, value: `${raw.match(/^[^\s=]+/)[0]}="${escapeHtml(next)}"` })
      }
    }
    if (node.tagName === 'style') {
      for (const child of node.childNodes || []) {
        if (child.nodeName !== '#text' || !child.sourceCodeLocation) continue
        const value = child.value
        if (/@import\b/i.test(value.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ''))) problems.push('Ask the designer to inline imported stylesheets before importing this email.')
        const next = cssUrls(value, rewrite)
        if (next !== value) edits.push({ start: offset + child.sourceCodeLocation.startOffset, end: offset + child.sourceCodeLocation.endOffset, value: next })
      }
      return
    }
    for (const child of node.childNodes || []) walk(child, source, offset, depth)
    if (node.content) walk(node.content, source, offset, depth)
  }
  walk(parse(String(html), { sourceCodeLocationInfo: true }), String(html))
  let output = String(html)
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end)
  return { html: output, references, problems: [...new Set(problems)] }
}

export function emailHtmlAssetIssues(html) {
  const { references, problems } = rewriteEmailAssets(html)
  const missing = [...new Set(references.filter((ref) => ref.kind === 'local').map((ref) => ref.value))]
  const unsupported = references.some((ref) => ref.kind === 'unsupported')
  return [...problems, ...(missing.length ? [`Upload or replace the local images before sending: ${missing.join(', ')}.`] : []), ...(unsupported ? ['Replace embedded, dynamic or unsupported image references with public image links.'] : [])]
}
