import type { FastifyReply, FastifyRequest } from 'fastify'

import type { PaperStore } from '@education-ai/paper-store'
import {
  renderMarkSchemePdf,
  renderPaperPdf,
} from '@education-ai/pdf-generation'

import { isHttpErrorResult } from '../../http/httpResult'
import { sendHttpResult } from '../../http/sendHttpResult'
import { paperServices } from '../../services/paperServices'

export type PdfKind = 'paper' | 'markScheme'

// Streams the PDF itself rather than a JSON envelope around base64.
// A browser, a download and `curl -o` all want bytes with a content
// type; wrapping them would make every consumer decode before they
// could open the file.
export async function getPaperPdf(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  paperStore: PaperStore,
  kind: PdfKind
): Promise<FastifyReply> {
  const result = await paperServices.getPaper(request.params.id, paperStore)

  if (isHttpErrorResult(result)) {
    return sendHttpResult(reply, result)
  }

  const { paper } = result.body.data
  const bytes =
    kind === 'markScheme'
      ? await renderMarkSchemePdf(paper)
      : await renderPaperPdf(paper, { duration: '1 hour 15 minutes' })

  const suffix = kind === 'markScheme' ? '-mark-scheme' : ''

  return reply
    .status(200)
    .header('content-type', 'application/pdf')
    .header(
      'content-disposition',
      `inline; filename="${paper.syllabusCode}-${request.params.id}${suffix}.pdf"`
    )
    .send(Buffer.from(bytes))
}
