// svg-to-pdfkit ships no types. Declared narrowly rather than pulled
// from DefinitelyTyped: this is the whole surface used, and a wider
// declaration would claim more than has been verified.
declare module 'svg-to-pdfkit' {
  function SVGtoPDF(
    document: PDFKit.PDFDocument,
    svg: string,
    x?: number,
    y?: number,
    options?: { width?: number; height?: number; preserveAspectRatio?: string }
  ): void

  export default SVGtoPDF
}
