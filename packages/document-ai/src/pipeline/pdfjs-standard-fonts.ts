import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Without this, pdfjs can't measure/substitute glyphs for PDFs that
// reference standard (non-embedded) fonts — e.g. Cambridge's examiner
// reports and grade-description PDFs, unlike their question papers, which
// embed all fonts. Symptom without it: a `standardFontDataUrl` warning
// logged per glyph, and parsing that's ~1000x slower (a 6-page PDF went
// from hanging past a 2-minute timeout to 104ms once this was set).
export function resolveStandardFontDataUrl(): string {
  const pdfjsPackageJsonPath = fileURLToPath(
    import.meta.resolve('pdfjs-dist/package.json')
  )
  return path.join(path.dirname(pdfjsPackageJsonPath), 'standard_fonts') + '/'
}
