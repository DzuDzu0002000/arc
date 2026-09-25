import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, parseAbi, type Hex } from 'viem'
import { encodeFundBatch, encodePayBug, escrowAbi, receiptFundsCampaign, receiptPaysBug, uuidToBytes32 } from '../server/escrow.ts'

const escrow = '0x00000000000000000000000000000000000e5c00' as Hex
const usdc = '0x3600000000000000000000000000000000000000' as Hex
const owner = '0x1111111111111111111111111111111111111111' as Hex
const tester = '0x2222222222222222222222222222222222222222' as Hex
const campaignId = uuidToBytes32('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')
const bugId = uuidToBytes32('0b7e8d4c-1a2b-4c3d-8e9f-001122334455')

function bugPaidLog(amount: bigint, who: Hex = tester, address: Hex = escrow) {
  const topics = encodeEventTopics({ abi: escrowAbi, eventName: 'BugPaid', args: { campaignId, bugId, tester: who } })
  const data = encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }], [amount, owner])
  return { address, topics, data }
}

test('uuid maps to a left-padded bytes32', () => {
  assert.equal(campaignId, '0x000000000000000000000000000000003f2a9c1e5b7d4e8a9c217d4e5f6a8b90')
  assert.throws(() => uuidToBytes32('not-a-uuid'))
})

test('funding batch approves exactly the budget, then funds', () => {
  const callData = encodeFundBatch({ usdc, escrow, campaignId, amount: 500_000_000n, maxPayout: 100_000_000n, endsAt: 1_790_000_000n })
  const batch = decodeFunctionData({ abi: parseAbi(['function executeBatch((address target, uint256 value, bytes data)[] calls)']), data: callData })
  const [calls] = batch.args
  assert.equal(calls.length, 2)
  assert.equal(calls[0].target.toLowerCase(), usdc)
  const approve = decodeFunctionData({ abi: parseAbi(['function approve(address spender, uint256 amount)']), data: calls[0].data })
  assert.deepEqual(approve.args, [escrow, 500_000_000n])
  const fund = decodeFunctionData({ abi: escrowAbi, data: calls[1].data })
  assert.equal(fund.functionName, 'fund')
  assert.deepEqual(fund.args, [campaignId, 500_000_000n, 100_000_000n, 1_790_000_000n])
})

test('payout verification needs the exact event from the escrow contract', () => {
  const expected = { campaignId, bugId, tester, amount: 50_000_000n }
  assert.ok(receiptPaysBug({ status: 'success', logs: [bugPaidLog(50_000_000n)] }, escrow, expected))
  assert.equal(receiptPaysBug({ status: 'reverted', logs: [bugPaidLog(50_000_000n)] }, escrow, expected), false)
  assert.equal(receiptPaysBug({ status: 'success', logs: [bugPaidLog(5_000_000n)] }, escrow, expected), false)
  assert.equal(receiptPaysBug({ status: 'success', logs: [bugPaidLog(50_000_000n, owner)] }, escrow, expected), false)
  const impostor = '0x9999999999999999999999999999999999999999' as Hex
  assert.equal(receiptPaysBug({ status: 'success', logs: [bugPaidLog(50_000_000n, tester, impostor)] }, escrow, expected), false)
  assert.equal(receiptFundsCampaign({ status: 'success', logs: [bugPaidLog(50_000_000n)] }, escrow, {
    campaignId, owner, amount: 1n, maxPayout: 1n, endsAt: 1n,
  }), false)
})

test('payBug calldata carries the server-computed amount', () => {
  const data = encodePayBug({ campaignId, bugId, tester, amount: 20_000_000n })
  const decoded = decodeFunctionData({ abi: escrowAbi, data })
  assert.equal(decoded.functionName, 'payBug')
  assert.deepEqual(decoded.args, [campaignId, bugId, tester, 20_000_000n])
})
