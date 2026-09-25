import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'
import { env } from './env.js'
import { encodePayBug, escrowAbi, type EscrowReceipt } from './escrow.js'

export const USDC_ADDRESS = usdc.addresses[arcTestnet.id].toLowerCase() as Hex

let publicClient: ReturnType<typeof createPublicClient> | null = null
function reader() {
  publicClient ??= createPublicClient({ chain: arcTestnet, transport: http(env.arcRpcUrl(), { timeout: 15_000 }) })
  return publicClient
}

/** Receipt of a mined transaction, or null while it is still pending. Arc has sub-second finality. */
export async function getReceipt(hash: Hex): Promise<EscrowReceipt | null> {
  try {
    const receipt = await reader().getTransactionReceipt({ hash })
    return { status: receipt.status, logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data })) }
  } catch (error) {
    if (error instanceof Error && error.name === 'TransactionReceiptNotFoundError') return null
    throw error
  }
}

export async function usdcBalance(address: Hex): Promise<bigint> {
  return reader().readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
}

export async function escrowCampaign(campaignId: Hex) {
  const [owner, endsAt, withdrawn, maxPayout, balance] = await reader().readContract({
    address: env.escrowAddress(), abi: escrowAbi, functionName: 'campaigns', args: [campaignId],
  })
  return { owner, endsAt, withdrawn, maxPayout, balance }
}

export async function isBugPaidOnChain(bugId: Hex): Promise<boolean> {
  return reader().readContract({ address: env.escrowAddress(), abi: escrowAbi, functionName: 'bugPaid', args: [bugId] })
}

/** The platform arbiter pays a bug from escrow (timeout auto-accept, dispute upheld, owner never signed). */
export async function arbiterPayBug(args: { campaignId: Hex; bugId: Hex; tester: Hex; amount: bigint }) {
  const account = privateKeyToAccount(env.arbiterPrivateKey())
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(env.arcRpcUrl(), { timeout: 30_000 }) })
  const hash = await wallet.sendTransaction({ to: env.escrowAddress(), data: encodePayBug(args) })
  await reader().waitForTransactionReceipt({ hash, timeout: 30_000 })
  return hash
}
