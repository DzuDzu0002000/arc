import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chunk, needsTranslation } from '../server/translate.ts'

test('only Vietnamese text is sent for translation', () => {
  assert.equal(needsTranslation('Test luồng đăng nhập'), true)
  assert.equal(needsTranslation('Test the sign-in flow'), false)
  assert.equal(needsTranslation(''), false)
  assert.equal(needsTranslation(null), false)
})

test('long lines are split under the MyMemory 500-byte limit without losing words', () => {
  const line = Array.from({ length: 80 }, (_, i) => `Kiểm thử bước ${i} của luồng thanh toán.`).join(' ')
  const pieces = chunk(line)
  assert.ok(pieces.length > 1)
  for (const piece of pieces) assert.ok(Buffer.byteLength(piece, 'utf8') <= 450)
  assert.equal(pieces.join(' '), line)
  assert.deepEqual(chunk('ngắn'), ['ngắn'])
})
