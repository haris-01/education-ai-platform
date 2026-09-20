import type { FastifyInstance } from 'fastify'

import type { TelemetryStore } from '@education-ai/ai-telemetry'
import type { PaperStore } from '@education-ai/paper-store'

import { paperControllers } from '../controllers/paperControllers'
import { telemetryControllers } from '../controllers/telemetryControllers'
import type { GeneratePaperDependencies } from '../services/paperServices/generatePaper'

export interface RouteDependencies extends GeneratePaperDependencies {
  paperStore: PaperStore

  telemetryStore: TelemetryStore
}

// Routes are verbs where they are actions and resources where they are
// reads, which is the split docs/BEST-CODING_PRACTICES.md asks for:
// `POST /api/papers/generate` is a use-case command, and the GETs are
// resource-shaped because a read has no state machine to drive.
export function registerRoutes(
  app: FastifyInstance,
  dependencies: RouteDependencies
): void {
  app.get('/health', async () => ({
    data: { status: 'ok' },
    meta: { operation: 'health.checked' },
  }))

  app.get<{ Querystring: { hours?: string } }>(
    '/api/telemetry/usage',
    (request, reply) =>
      telemetryControllers.getUsage(request, reply, dependencies.telemetryStore)
  )

  app.post('/api/papers/generate', (request, reply) =>
    paperControllers.generatePaper(request, reply, dependencies)
  )

  app.get<{ Querystring: { syllabusCode?: string } }>(
    '/api/papers',
    (request, reply) =>
      paperControllers.getAllPapers(request, reply, dependencies.paperStore)
  )

  app.get<{ Params: { id: string } }>('/api/papers/:id', (request, reply) =>
    paperControllers.getPaper(request, reply, dependencies.paperStore)
  )

  app.get<{ Params: { id: string } }>(
    '/api/papers/:id/paper.pdf',
    (request, reply) =>
      paperControllers.getPaperPdf(
        request,
        reply,
        dependencies.paperStore,
        'paper'
      )
  )

  app.get<{ Params: { id: string } }>(
    '/api/papers/:id/mark-scheme.pdf',
    (request, reply) =>
      paperControllers.getPaperPdf(
        request,
        reply,
        dependencies.paperStore,
        'markScheme'
      )
  )
}
