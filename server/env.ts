function required(name: string) {
  const value = process.env[name]
  if (!value) throw new ConfigError(`${name} is not configured`)
  return value
}

export class ConfigError extends Error {}

export const env = {
  circleApiKey: () => required('CIRCLE_API_KEY'),
  sessionSecret: () => {
    const secret = required('SESSION_SECRET')
    if (secret.length < 32) throw new ConfigError('SESSION_SECRET must be at least 32 characters')
    return secret
  },
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  arcRpcUrl: () => process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  escrowAddress: () => {
    const address = required('ESCROW_ADDRESS')
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new ConfigError('ESCROW_ADDRESS is invalid')
    return address.toLowerCase() as `0x${string}`
  },
  arbiterPrivateKey: () => required('ARBITER_PRIVATE_KEY') as `0x${string}`,
  adminCircleUserIds: () => (process.env.ADMIN_CIRCLE_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean),
  cronSecret: () => required('CRON_SECRET'),
  isProduction: () => process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production',
}
