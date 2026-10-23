import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios'
import https from 'node:https'
import { getHttpsAgent, sharedHttpsAgent } from './https-agent'

const AXIOS_DEFAULT_TIMEOUT_MS = 60000

export interface HttpClientConfig extends CreateAxiosDefaults {
  /**
   * Optional configuration for the underlying HTTPS Agent.
   * If provided, a specific agent will be resolved/created.
   * If omitted, the default shared singleton agent is used.
   */
  agentOptions?: https.AgentOptions
}

/**
 * Creates a configured Axios instance using the shared connection pooling strategy.
 */
export const createHttpClient = (config: HttpClientConfig = {}): AxiosInstance => {
  const { agentOptions, ...axiosConfig } = config

  // Use the specific agent if options are passed, otherwise use the global singleton
  const httpsAgent = agentOptions ? getHttpsAgent(agentOptions) : sharedHttpsAgent

  return axios.create({
    httpsAgent,
    // Default request timeout (distinct from socket timeout)
    timeout: config.timeout ?? AXIOS_DEFAULT_TIMEOUT_MS,
    ...axiosConfig,
  })
}
