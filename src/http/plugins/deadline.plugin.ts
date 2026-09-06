import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { Deadline } from 'core/shared/deadline'

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * This request's remaining time budget. Unbounded unless the route declares
     * `config.deadlineMs`. Pass it into the use-case; never read the clock again
     * below this point.
     */
    deadline: Deadline
  }

  interface FastifyContextConfig {
    /** Opt this route into a request budget — see HTTP_DEADLINE_POLICIES. */
    deadlineMs?: number
  }
}

/** Abort reason recorded when the client hangs up before we answered. */
export const CLIENT_DISCONNECTED_REASON = 'CLIENT_DISCONNECTED'

/**
 * Builds the budget for one request and links it to the client going away.
 *
 * Node fires `close` on the request for *every* connection teardown, including
 * a perfectly normal one, so the response state is what distinguishes "the
 * client left" from "we finished". Without that check every successful request
 * would abort its own deadline on the way out.
 */
function startRequestDeadline(budgetMs: number, request: FastifyRequest, reply: FastifyReply): Deadline {
  const disconnected = new AbortController()

  request.raw.on('close', () => {
    if (!reply.raw.writableEnded) {
      disconnected.abort(CLIENT_DISCONNECTED_REASON)
    }
  })

  return Deadline.in(budgetMs, { linkedTo: disconnected.signal })
}

/**
 * Establishes the one clock a request is measured against.
 *
 * Everything downstream — cache reads, provider chains, individual HTTP
 * attempts, backoff sleeps — derives from this deadline rather than starting a
 * timer of its own, which is what keeps nested timeouts from stacking past the
 * budget the client is actually waiting on.
 */
const deadlinePlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('deadline')

  // `onRequest` runs after routing, so the route's config is already resolved.
  app.addHook('onRequest', (request, reply, done) => {
    const budgetMs = request.routeOptions?.config?.deadlineMs

    request.deadline = budgetMs ? startRequestDeadline(budgetMs, request, reply) : Deadline.none()

    done()
  })

  // Release the timer as soon as the answer is out, rather than waiting for the
  // budget to elapse on a request that is already finished.
  app.addHook('onResponse', (request, _reply, done) => {
    request.deadline?.dispose()
    done()
  })
}

export const requestDeadline = fp(deadlinePlugin, {
  name: 'request-deadline',
})
