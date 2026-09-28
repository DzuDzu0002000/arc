import { decodeEventLog, encodeFunctionData, parseAbi, type Hex } from 'viem'

// Keep in sync with contracts/src/ArcHuntEscrow.sol
export const escrowAbi = parseAbi([
  'function fund(bytes32 campaignId, uint128 amount, uint128 maxPayout, uint64 endsAt)',
  'function topUp(bytes32 campaignId, uint128 amount)',
  'function payBug(bytes32 campaignId, bytes32 bugId, address tester, uint128 amount)',
  'function withdrawRemaining(bytes32 campaignId)',
  'function campaigns(bytes32) view returns (address owner, uint64 endsAt, bool withdrawn, uint128 maxPayout, uint128 balance)',
  'function bugPaid(bytes32) view returns (bool)',
  'event CampaignFunded(bytes32 indexed campaignId, address indexed owner, uint256 amount, uint256 maxPayout, uint64 endsAt)',
  'event CampaignToppedUp(bytes32 indexed campaignId, uint256 amount)',
  'event BugPaid(bytes32 indexed campaignId, bytes32 indexed bugId, address indexed tester, uint256 amount, address payer)',
  'event RemainingWithdrawn(bytes32 indexed campaignId, address indexed owner, uint256 amount)',
])

const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)'])
// Circle user-controlled SCA wallets expose executeBatch, so approve + fund need a single PIN confirmation.
const scaWalletAbi = parseAbi(['function executeBatch((address target, uint256 value, bytes data)[] calls)'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A database UUID as the bytes32 id used on chain (left-padded, reversible). */
export function uuidToBytes32(uuid: string): Hex {
  if (!UUID.test(uuid)) throw new Error('Invalid UUID')
  return `0x${uuid.replace(/-/g, '').toLowerCase().padStart(64, '0')}`
}

export function unixSeconds(iso: string): bigint {
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) throw new Error('Invalid date')
  return BigInt(Math.floor(ms / 1000))
}

export function encodeFundBatch(args: {
  usdc: Hex; escrow: Hex; campaignId: Hex; amount: bigint; maxPayout: bigint; endsAt: bigint
}): Hex {
  const approve = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [args.escrow, args.amount] })
  const fund = encodeFunctionData({ abi: escrowAbi, functionName: 'fund', args: [args.campaignId, args.amount, args.maxPayout, args.endsAt] })
  return encodeFunctionData({
    abi: scaWalletAbi,
    functionName: 'executeBatch',
    args: [[{ target: args.usdc, value: 0n, data: approve }, { target: args.escrow, value: 0n, data: fund }]],
  })
}

export function encodePayBug(args: { campaignId: Hex; bugId: Hex; tester: Hex; amount: bigint }): Hex {
  return encodeFunctionData({ abi: escrowAbi, functionName: 'payBug', args: [args.campaignId, args.bugId, args.tester, args.amount] })
}

export function encodeWithdraw(campaignId: Hex): Hex {
  return encodeFunctionData({ abi: escrowAbi, functionName: 'withdrawRemaining', args: [campaignId] })
}

type Log = { address: string; topics: readonly Hex[] | Hex[]; data: Hex }
export type EscrowReceipt = { status: 'success' | 'reverted'; logs: Log[] }

function escrowEvents(receipt: EscrowReceipt, escrow: string) {
  if (receipt.status !== 'success') return []
  return receipt.logs.flatMap((log) => {
    if (log.address.toLowerCase() !== escrow.toLowerCase()) return []
    try {
      return [decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })]
    } catch {
      return []
    }
  })
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** True only when the receipt succeeded and holds exactly the funding the server expects. */
export function receiptFundsCampaign(receipt: EscrowReceipt, escrow: string, expected: {
  campaignId: Hex; owner: string; amount: bigint; maxPayout: bigint; endsAt: bigint
}): boolean {
  return escrowEvents(receipt, escrow).some((event) => event.eventName === 'CampaignFunded'
    && same(event.args.campaignId, expected.campaignId) && same(event.args.owner, expected.owner)
    && event.args.amount === expected.amount && event.args.maxPayout === expected.maxPayout && event.args.endsAt === expected.endsAt)
}

export function receiptPaysBug(receipt: EscrowReceipt, escrow: string, expected: {
  campaignId: Hex; bugId: Hex; tester: string; amount: bigint
}): boolean {
  return escrowEvents(receipt, escrow).some((event) => event.eventName === 'BugPaid'
    && same(event.args.campaignId, expected.campaignId) && same(event.args.bugId, expected.bugId)
    && same(event.args.tester, expected.tester) && event.args.amount === expected.amount)
}

export function receiptWithdraws(receipt: EscrowReceipt, escrow: string, expected: { campaignId: Hex; owner: string }): boolean {
  return escrowEvents(receipt, escrow).some((event) => event.eventName === 'RemainingWithdrawn'
    && same(event.args.campaignId, expected.campaignId) && same(event.args.owner, expected.owner))
}
