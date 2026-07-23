import https from 'https'

const agents = new Map<string, https.Agent>()

/**
 * Default configuration optimized for high concurrency.
 * - keepAlive: true (Crucial for reuse)
 * - maxSockets: 128 (Allows high concurrency per host)
 * - timeout: 60s (Socket inactivity timeout)
 */
const DEFAULT_CONFIG: https.AgentOptions = {
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: 30000,
  scheduling: 'lifo',
}

/**
 * Returns a shared HTTPS Agent.
 * Implements a Singleton pattern per configuration key.
 * * @param options - Configuration overrides for specific needs (e.g. timeout, maxSockets)
 */
export const getHttpsAgent = (options: https.AgentOptions = {}): https.Agent => {
  const finalConfig = { ...DEFAULT_CONFIG, ...options }

  // Generate a unique key for this configuration to ensure we reuse the agent
  // for identical requirements (Singleton behavior).
  const key = JSON.stringify(finalConfig, Object.keys(finalConfig).sort())

  if (!agents.has(key)) {
    agents.set(key, new https.Agent(finalConfig))
  }

  let agent = agents.get(key)
  if (!agent) {
    agent = new https.Agent(finalConfig)
    agents.set(key, agent)
  }

  return agent
}

// Export the default shared singleton for general use
export const sharedHttpsAgent = getHttpsAgent()
