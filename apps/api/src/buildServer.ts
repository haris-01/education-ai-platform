import Fastify from 'fastify'
import type { FastifyError, FastifyInstance } from 'fastify'

import { API_ERROR_CODE } from './http/apiErrorCodes'
import { registerRoutes } from './routes'
import type { RouteDependencies } from './routes'

export interface BuildServerOptions extends RouteDependencies {
  logger?: boolean
}

// Built as a function taking its dependencies rather than reaching for
// module-level singletons, so a test can run the whole HTTP surface
// against a fake generator and a throwaway schema without a server
// process, a port, or an API key.
export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false })

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: API_ERROR_CODE.PAPER_NOT_FOUND,
      message: `No route for ${request.method} ${request.url}.`,
    })
  )

  // Anything reaching here is unexpected by definition — expected 4xx
  // are returned as HttpResult, never thrown. So it is logged in full
  // and answered with a generic body: an internal error's message can
  // carry a connection string or a prompt, and neither belongs in a
  // client's hands.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, 'unhandled error')

    if (error.validation) {
      return reply.status(400).send({
        code: API_ERROR_CODE.REQUEST_VALIDATION_FAILED,
        message: 'The request is not valid.',
      })
    }

    return reply.status(500).send({
      code: API_ERROR_CODE.INTERNAL_ERROR,
      message: 'The request could not be completed.',
    })
  })

  registerRoutes(app, options)

  return app
}
