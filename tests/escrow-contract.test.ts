// Runs the real ArcHuntEscrow bytecode in an in-process EVM (no Foundry or RPC needed).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createBlock } from '@ethereumjs/block'
import { Common, Hardfork, Mainnet } from '@ethereumjs/common'
import { createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util'
import { createVM } from '@ethereumjs/vm'
import { decodeErrorResult, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, parseAbi, type Abi, type Hex } from 'viem'
import { escrowAbi, receiptFundsCampaign, receiptPaysBug, uuidToBytes32, type EscrowReceipt } from '../server/escrow.ts'

const require = createRequire(import.meta.url)
const solc = require('solc')

const MOCK_USDC = `
pragma solidity ^0.8.24;
contract MockUsdc {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
  function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
  function transfer(address to, uint256 amount) external returns (bool) { balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true;
  }
}`

function compile() {
  const escrowSource = readFileSync(new URL('../contracts/src/ArcHuntEscrow.sol', import.meta.url), 'utf8')
  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { 'ArcHuntEscrow.sol': { content: escrowSource }, 'MockUsdc.sol': { content: `// SPDX-License-Identifier: MIT\n${MOCK_USDC}` } },
    settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  })))
  const errors = (output.errors || []).filter((e: { severity: string }) => e.severity === 'error')
  assert.equal(errors.length, 0, JSON.stringify(errors))
  const pick = (file: string, name: string) => ({ abi: output.contracts[file][name].abi as Abi, bytecode: `0x${output.contracts[file][name].evm.bytecode.object}` as Hex })
  return { escrow: pick('ArcHuntEscrow.sol', 'ArcHuntEscrow'), usdc: pick('MockUsdc.sol', 'MockUsdc') }
}

const usdcAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
])

const OWNER = '0x00000000000000000000000000000000000a11ce' as Hex
const TESTER = '0x0000000000000000000000000000000000000b0b' as Hex
const ARBITER = '0x0000000000000000000000000000000000000a2b' as Hex
const STRANGER = '0x0000000000000000000000000000000000000bad' as Hex
const START = 1_790_000_000n
const DAY = 86_400n

async function setup() {
  const { escrow, usdc } = compile()
  const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun })
  const vm = await createVM({ common })
  let now = START

  async function exec(from: Hex, to: Hex | null, data: Hex) {
    const result = await vm.evm.runCall({
      caller: createAddressFromString(from), origin: createAddressFromString(from),
      to: to ? createAddressFromString(to) : undefined, data: hexToBytes(data), gasLimit: 10_000_000n, skipBalance: true,
      block: createBlock({ header: { timestamp: now, number: 1n, gasLimit: 30_000_000n } }, { common }),
    })
    return {
      ok: !result.execResult.exceptionError,
      returnData: bytesToHex(result.execResult.returnValue) as Hex,
      created: result.createdAddress?.toString() as Hex | undefined,
      receipt: {
        status: result.execResult.exceptionError ? 'reverted' : 'success',
        logs: (result.execResult.logs ?? []).map(([address, topics, data]) => ({
          address: bytesToHex(address), topics: topics.map((t) => bytesToHex(t) as Hex), data: bytesToHex(data) as Hex,
        })),
      } as EscrowReceipt,
    }
  }

  const deploy = async (bytecode: Hex, args: Hex = '0x') => {
    const r = await exec(OWNER, null, `${bytecode}${args.slice(2)}` as Hex)
    assert.ok(r.ok && r.created, 'deploy failed')
    return r.created as Hex
  }

  const usdcAddress = await deploy(usdc.bytecode)
  const escrowAddress = await deploy(escrow.bytecode, encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [usdcAddress, ARBITER]))

  const call = (from: Hex, fn: string, args: unknown[]) =>
    exec(from, escrowAddress, encodeFunctionData({ abi: escrowAbi, functionName: fn as 'fund', args: args as never }))
  const usdcCall = (from: Hex, fn: 'mint' | 'approve', args: [Hex, bigint]) =>
    exec(from, usdcAddress, encodeFunctionData({ abi: usdcAbi, functionName: fn, args }))
  const balance = async (who: Hex) => {
    const r = await exec(OWNER, usdcAddress, encodeFunctionData({ abi: usdcAbi, functionName: 'balanceOf', args: [who] }))
    return decodeFunctionResult({ abi: usdcAbi, functionName: 'balanceOf', data: r.returnData })
  }
  const revertName = (data: Hex) => decodeErrorResult({ abi: escrow.abi, data }).errorName

  return { call, usdcCall, balance, revertName, escrowAddress, warp: (t: bigint) => { now = t } }
}

const campaignId = uuidToBytes32('3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90')
const bug1 = uuidToBytes32('00000000-0000-4000-8000-000000000001')
const bug2 = uuidToBytes32('00000000-0000-4000-8000-000000000002')
const USDC = 1_000_000n

async function funded() {
  const env = await setup()
  await env.usdcCall(OWNER, 'mint', [OWNER, 1000n * USDC])
  await env.usdcCall(OWNER, 'approve', [env.escrowAddress, 500n * USDC])
  const r = await env.call(OWNER, 'fund', [campaignId, 500n * USDC, 100n * USDC, START + 7n * DAY])
  assert.ok(r.ok, 'fund failed')
  return env
}

test('fund pulls exactly the budget into escrow', async () => {
  const env = await funded()
  assert.equal(await env.balance(env.escrowAddress), 500n * USDC)
  assert.equal(await env.balance(OWNER), 500n * USDC)
  const again = await env.call(OWNER, 'fund', [campaignId, 1n, 1n, START + DAY])
  assert.equal(again.ok, false)
  assert.equal(env.revertName(again.returnData), 'CampaignExists')
})

test('owner pays a bug once; the same bug id cannot be paid twice', async () => {
  const env = await funded()
  assert.ok((await env.call(OWNER, 'payBug', [campaignId, bug1, TESTER, 50n * USDC])).ok)
  assert.equal(await env.balance(TESTER), 50n * USDC)
  const twice = await env.call(ARBITER, 'payBug', [campaignId, bug1, TESTER, 50n * USDC])
  assert.equal(env.revertName(twice.returnData), 'AlreadyPaid')
})

test('arbiter can pay up to maxPayout; strangers and self-payment are blocked', async () => {
  const env = await funded()
  assert.ok((await env.call(ARBITER, 'payBug', [campaignId, bug1, TESTER, 100n * USDC])).ok)
  assert.equal(env.revertName((await env.call(ARBITER, 'payBug', [campaignId, bug2, TESTER, 101n * USDC])).returnData), 'PayoutTooLarge')
  assert.equal(env.revertName((await env.call(STRANGER, 'payBug', [campaignId, bug2, STRANGER, 1n * USDC])).returnData), 'NotOwnerOrArbiter')
  assert.equal(env.revertName((await env.call(OWNER, 'payBug', [campaignId, bug2, OWNER, 1n * USDC])).returnData), 'InvalidTester')
})

test('remainder unlocks only 14 days after the end date, and only for the owner', async () => {
  const env = await funded()
  assert.equal(env.revertName((await env.call(OWNER, 'withdrawRemaining', [campaignId])).returnData), 'StillLocked')
  env.warp(START + 7n * DAY + 14n * DAY)
  assert.equal(env.revertName((await env.call(ARBITER, 'withdrawRemaining', [campaignId])).returnData), 'NotOwner')
  assert.ok((await env.call(OWNER, 'withdrawRemaining', [campaignId])).ok)
  assert.equal(await env.balance(OWNER), 1000n * USDC)
  assert.equal(env.revertName((await env.call(ARBITER, 'payBug', [campaignId, bug2, TESTER, 1n * USDC])).returnData), 'InsufficientBalance')
})

test('payouts cannot exceed what is left in escrow', async () => {
  const env = await funded()
  for (let i = 1; i <= 5; i++) {
    const id = uuidToBytes32(`00000000-0000-4000-8000-00000000001${i}`)
    assert.ok((await env.call(OWNER, 'payBug', [campaignId, id, TESTER, 100n * USDC])).ok)
  }
  const extra = await env.call(OWNER, 'payBug', [campaignId, bug2, TESTER, 1n * USDC])
  assert.equal(env.revertName(extra.returnData), 'InsufficientBalance')
  assert.equal(await env.balance(TESTER), 500n * USDC)
})

test('server verification accepts the real events the contract emits', async () => {
  const env = await setup()
  await env.usdcCall(OWNER, 'mint', [OWNER, 1000n * USDC])
  await env.usdcCall(OWNER, 'approve', [env.escrowAddress, 500n * USDC])
  const fund = await env.call(OWNER, 'fund', [campaignId, 500n * USDC, 100n * USDC, START + 7n * DAY])
  assert.ok(receiptFundsCampaign(fund.receipt, env.escrowAddress, { campaignId, owner: OWNER, amount: 500n * USDC, maxPayout: 100n * USDC, endsAt: START + 7n * DAY }))
  assert.equal(receiptFundsCampaign(fund.receipt, env.escrowAddress, { campaignId, owner: OWNER, amount: 400n * USDC, maxPayout: 100n * USDC, endsAt: START + 7n * DAY }), false)

  const pay = await env.call(OWNER, 'payBug', [campaignId, bug1, TESTER, 20n * USDC])
  assert.ok(receiptPaysBug(pay.receipt, env.escrowAddress, { campaignId, bugId: bug1, tester: TESTER, amount: 20n * USDC }))
  assert.equal(receiptPaysBug(pay.receipt, env.escrowAddress, { campaignId, bugId: bug2, tester: TESTER, amount: 20n * USDC }), false)
})
