export interface DiagramBrief {
  // What the figure must show, written by the question generator.
  brief: string

  // Printed beneath the figure, e.g. "Fig. 3.1".
  label: string
}

export interface Diagram {
  label: string

  // The SVG source, validated and sanitised.
  //
  // SVG rather than a raster image, and generated as code rather than
  // by an image model. An exam diagram is a technical drawing: a ray
  // striking a boundary at a stated angle, a circuit with named
  // components, axes with units. It needs exact geometry and real text
  // labels that survive being printed at A4 and read by a candidate.
  // Image models produce something that looks like a circuit; a text
  // model writing SVG produces a circuit, and one that can be
  // inspected, diffed and corrected.
  svg: string

  // Intrinsic size in user units, read from the viewBox.
  width: number

  height: number
}

// The one thing every diagram generator has to do — deliberately the
// same shape as Embedder and QuestionGenerator.
export interface DiagramGenerator {
  readonly model: string

  generate(brief: DiagramBrief): Promise<Diagram>
}
