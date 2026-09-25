// USDC amounts. The ERC-20 interface of Arc's USDC uses 6 decimals (native gas balance uses 18; we never touch that here).
export const USDC_DECIMALS = 6
const UNIT = 1_000_000n
const AMOUNT_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/

export function isUsdcAmount(value: unknown): value is string {
  return typeof value === 'string' && AMOUNT_PATTERN.test(value)
}

/** "12.5" -> 12500000n. Returns null for anything that is not a plain non-negative amount with ≤ 6 decimals. */
export function parseUsdc(value: unknown): bigint | null {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value)
  if (!isUsdcAmount(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * UNIT + BigInt(fraction.padEnd(USDC_DECIMALS, '0'))
}

/** 12500000n -> "12.5" */
export function formatUsdc(units: bigint): string {
  const negative = units < 0n
  const abs = negative ? -units : units
  const whole = abs / UNIT
  const fraction = (abs % UNIT).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Postgres numeric(20,6) comes back as a string such as "50.000000". */
export function dbAmountToUnits(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n
  const text = typeof value === 'number' ? value.toFixed(6) : value
  const match = /^(\d+)(?:\.(\d{1,6})\d*)?$/.exec(text.trim())
  if (!match) throw new Error(`Invalid stored amount: ${text}`)
  return BigInt(match[1]) * UNIT + BigInt((match[2] || '').padEnd(USDC_DECIMALS, '0'))
}
