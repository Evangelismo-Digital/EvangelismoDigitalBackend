import { env } from '@env/index'

export const HTTP_RATE_LIMIT_POLICIES = {
  global: {
    max: env.HTTP_RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW,
  },
  auth: {
    session: {
      max: env.HTTP_RATE_LIMIT_AUTH_SESSION_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW,
    },
    register: {
      max: env.HTTP_RATE_LIMIT_AUTH_REGISTER_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW,
    },
    forgotPassword: {
      max: env.HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW,
    },
    resetPassword: {
      max: env.HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW,
    },
  },
  users: {
    list: {
      max: env.HTTP_RATE_LIMIT_USERS_LIST_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW,
    },
    delete: {
      max: env.HTTP_RATE_LIMIT_USERS_DELETE_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW,
    },
  },
  churches: {
    nearest: {
      max: env.HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW,
    },
  },
  forms: {
    submit: {
      max: env.HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW,
    },
  },
  health: {
    check: {
      max: env.HTTP_RATE_LIMIT_HEALTH_CHECK_MAX,
      timeWindow: env.HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW,
      skipOnError: true,
    },
  },
} as const
