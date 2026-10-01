import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import postcss from 'postcss'

const kingdomCss = readFileSync(fileURLToPath(new URL('../app/kingdom.css', import.meta.url)), 'utf8')

test('Kingdom design rules cannot style another website template', () => {
  const root = postcss.parse(kingdomCss)
  root.walkRules((rule) => {
    for (const selector of rule.selectors) {
      assert.match(selector.trim(), /^\.template-kingdom(?:\b|[.#:[\s>+~])/)
    }
  })
  assert.doesNotMatch(kingdomCss, /\.template-home-seekers\b/)
})
