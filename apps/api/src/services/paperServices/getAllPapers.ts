import type { PaperStore, PaperSummary } from '@education-ai/paper-store'

import type { HttpResult } from '../../http/httpResult'
import { httpSuccess } from '../../http/httpResult'

export async function getAllPapers(
  syllabusCode: string | undefined,
  paperStore: PaperStore
): Promise<HttpResult<PaperSummary[]>> {
  return httpSuccess(await paperStore.list(syllabusCode), 'paper.listed')
}
