// Deploys ArcHuntEscrow to Arc Testnet.
// Usage: DEPLOYER_PRIVATE_KEY=0x... ARBITER_ADDRESS=0x... npm run contracts:deploy
// The deployer pays gas in USDC (get testnet USDC at https://faucet.circle.com).
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'

const { DEPLOYER_PRIVATE_KEY, ARBITER_ADDRESS, ARC_RPC_URL } = process.env
if (!DEPLOYER_PRIVATE_KEY || !ARBITER_ADDRESS || !isAddress(ARBITER_ADDRESS)) {
  console.error('Set DEPLOYER_PRIVATE_KEY and ARBITER_ADDRESS.')
  process.exit(1)
}

const artifact = JSON.parse(readFileSync(new URL('../contracts/out/ArcHuntEscrow.json', import.meta.url), 'utf8'))
const transport = http(ARC_RPC_URL || arcTestnet.rpcUrls.default.http[0])
const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY)
const wallet = createWalletClient({ account, chain: arcTestnet, transport })
const client = createPublicClient({ chain: arcTestnet, transport })

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [usdc.addresses[arcTestnet.id], ARBITER_ADDRESS],
})
console.log(`Deploy tx: ${hash}`)
const receipt = await client.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success' || !receipt.contractAddress) {
  console.error('Deployment failed.')
  process.exit(1)
}
console.log(`ArcHuntEscrow deployed at ${receipt.contractAddress}\nSet ESCROW_ADDRESS=${receipt.contractAddress}`)
