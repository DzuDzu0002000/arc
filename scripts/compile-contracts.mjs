// Compiles contracts/src/BuglineEscrow.sol with solc-js (no Foundry needed) and writes
// contracts/out/BuglineEscrow.json with { abi, bytecode }.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const solc = require('solc')

const source = readFileSync(new URL('../contracts/src/BuglineEscrow.sol', import.meta.url), 'utf8')
const input = {
  language: 'Solidity',
  sources: { 'BuglineEscrow.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors || []).filter((e) => e.severity === 'error')
for (const message of output.errors || []) console[message.severity === 'error' ? 'error' : 'warn'](message.formattedMessage)
if (errors.length) process.exit(1)

const contract = output.contracts['BuglineEscrow.sol'].BuglineEscrow
mkdirSync(new URL('../contracts/out/', import.meta.url), { recursive: true })
writeFileSync(new URL('../contracts/out/BuglineEscrow.json', import.meta.url), JSON.stringify({
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
}, null, 2))
console.log(`Compiled BuglineEscrow (${contract.evm.bytecode.object.length / 2} bytes) -> contracts/out/BuglineEscrow.json`)
