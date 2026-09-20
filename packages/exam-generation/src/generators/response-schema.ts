// The shape Gemini must return, as an OpenAPI-subset schema.
//
// Every field the pipeline reads is required. A schema that marks
// things optional to be accommodating produces responses missing the
// field that mattered, discovered after the call was paid for.
//
// Deliberately flatter than `GeneratedQuestion`: no nested sub-parts
// beyond one level, and no provenance. Sub-sub-parts are rare enough
// that allowing them costs more in schema complexity than it buys, and
// provenance is the pipeline's to record — asking a model which chunks
// it used invites it to invent ids.
export const QUESTION_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'text',
          'marks',
          'assessmentObjective',
          'difficulty',
          'requiresDiagram',
        ],
        properties: {
          text: {
            type: 'string',
            description: 'The question stem, as printed on the paper.',
          },
          marks: { type: 'integer' },
          assessmentObjective: {
            type: 'string',
            enum: ['AO1', 'AO2', 'AO3'],
          },
          difficulty: {
            type: 'string',
            enum: ['low', 'moderate', 'high'],
          },
          requiresDiagram: { type: 'boolean' },
          diagramBrief: {
            type: 'string',
            description:
              'What the figure must show. Required when requiresDiagram is true.',
          },
          markScheme: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text', 'marks'],
              properties: {
                text: { type: 'string' },
                marks: { type: 'integer' },
              },
            },
          },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'text', 'marks', 'markScheme'],
              properties: {
                label: { type: 'string' },
                text: { type: 'string' },
                marks: { type: 'integer' },
                markScheme: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['text', 'marks'],
                    properties: {
                      text: { type: 'string' },
                      marks: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              required: ['label', 'text', 'correct'],
              properties: {
                label: { type: 'string' },
                text: { type: 'string' },
                correct: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
} as const
