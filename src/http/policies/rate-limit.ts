export const HTTP_RATE_LIMIT_POLICIES = {
  global: {
    max: 300,
    timeWindow: '1 minute',
  },
  auth: {
    session: {
      max: 30,
      timeWindow: '1 minute',
    },
    register: {
      max: 1000,
      timeWindow: '1 minute',
    },
    registerAdmin: {
      max: 15,
      timeWindow: '1 hour',
    },
    forgotPassword: {
      max: 100,
      timeWindow: '1 hour',
    },
    resetPassword: {
      max: 200,
      timeWindow: '1 hour',
    },
  },
  users: {
    list: {
      max: 20,
      timeWindow: '1 hour',
    },
    delete: {
      max: 10,
      timeWindow: '1 hour',
    },
  },
  churches: {
    nearest: {
      max: 30000,
      timeWindow: '1 minute',
    },
  },
  forms: {
    submit: {
      max: 60,
      timeWindow: '1 minute',
    },
  },
  health: {
    check: {
      max: 120,
      timeWindow: '1 minute',
    },
  },
} as const

export type HttpRateLimitPolicy =
  (typeof HTTP_RATE_LIMIT_POLICIES)[keyof typeof HTTP_RATE_LIMIT_POLICIES]
