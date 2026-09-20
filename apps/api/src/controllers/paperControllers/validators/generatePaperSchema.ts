import { z } from 'zod'

// The request body a client may send.
//
// Only what the caller genuinely chooses. There is no field here for
// anything the server decides — no paper id, no generator model, no
// validation verdict — because a write API that accepts its own
// outputs invites a client to drive state the server owns.
export const generatePaperSchema = z.object({
  syllabusCode: z.string().min(1).max(16),
  title: z.string().min(1).max(200),
  modelledOnPaperCode: z.string().max(16).optional(),
  totalMarks: z.number().int().positive().max(400),
  topics: z
    .array(
      z.object({
        topicNumber: z.number().int().positive().max(99),
        questionCount: z.number().int().positive().max(60),
      })
    )
    .min(1)
    .max(30),
  assessmentObjectiveWeights: z.record(z.string(), z.number()).optional(),
  difficultyMix: z
    .object({
      low: z.number().optional(),
      moderate: z.number().optional(),
      high: z.number().optional(),
    })
    .optional(),
  tolerancePercent: z.number().min(0).max(100).optional(),
  multipleChoice: z.boolean().default(false),
  excludeSourceDocumentIds: z.array(z.string()).default([]),
  exemplarsPerTopic: z.number().int().min(1).max(20).default(5),
})

export type GeneratePaperBody = z.infer<typeof generatePaperSchema>
