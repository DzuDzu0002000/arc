// Every piece of Vietnamese UI text (and every t('…') key) must have an English translation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { en } from '../src/i18n-en.ts'

const VIETNAMESE = /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵĐ]/i

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    // mock.ts and mock-en.ts are demo data, i18n-en.ts is the dictionary itself, legal.tsx holds both languages in full.
    return /\.tsx?$/.test(name) && !/^((mock|mock-en|i18n-en)\.ts|legal\.tsx)$/.test(name) ? [path] : []
  })
}

export function uiStrings(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    const source = readFileSync(file, 'utf8').split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
    for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (VIETNAMESE.test(match[1])) keys.add(match[1])
    for (const match of source.matchAll(/\bt\('((?:[^'\\\n]|\\.)*)'/g)) keys.add(match[1])
  }
  keys.delete('Language / Ngôn ngữ')
  return keys
}

test('every UI string has an English translation', () => {
  const missing = [...uiStrings()].filter((key) => !(key in en))
  assert.deepEqual(missing, [], `Add these to src/i18n-en.ts:\n${missing.join('\n')}`)
})

test('translations keep the same {placeholders}', () => {
  const vars = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
  const broken = Object.entries(en).filter(([vi, english]) => vars(vi) !== vars(english)).map(([vi]) => vi)
  assert.deepEqual(broken, [])
})
