import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dbAmountToUnits, formatUsdc, parseUsdc } from '../server/money.ts'

test('parses plain USDC amounts into 6-decimal units', () => {
  assert.equal(parseUsdc('50'), 50_000_000n)
  assert.equal(parseUsdc('0.000001'), 1n)
  assert.equal(parseUsdc('12.5'), 12_500_000n)
  assert.equal(parseUsdc(20), 20_000_000n)
})

test('rejects malformed or over-precise amounts', () => {
  for (const bad of ['', '-1', '1.0000001', '01', '1e3', ' 1', 'abc', null, undefined, {}]) {
    assert.equal(parseUsdc(bad), null, String(bad))
  }
})

test('formats units back without trailing zeros', () => {
  assert.equal(formatUsdc(50_000_000n), '50')
  assert.equal(formatUsdc(12_500_000n), '12.5')
  assert.equal(formatUsdc(1n), '0.000001')
})

test('reads postgres numeric strings', () => {
  assert.equal(dbAmountToUnits('50.000000'), 50_000_000n)
  assert.equal(dbAmountToUnits('0.5'), 500_000n)
  assert.equal(dbAmountToUnits(null), 0n)
})
