import type { PaperStore, StoredPaper } from '@education-ai/paper-store'

import { API_ERROR_CODE } from '../../http/apiErrorCodes'
import type { HttpResult } from '../../http/httpResult'
import { httpError, httpSuccess } from '../../http/httpResult'

export async function getPaper(
  id: string,
  paperStore: PaperStore
): Promise<HttpResult<StoredPaper>> {
  const stored = await paperStore.find(id)

  if (!stored) {
    return httpError({
      statusCode: 404,
      code: API_ERROR_CODE.PAPER_NOT_FOUND,
      message: `No paper with id ${id}.`,
    })
  }

  return httpSuccess(stored, 'paper.fetched')
}
