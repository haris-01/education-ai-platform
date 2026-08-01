# savemyexams past-paper downloader

Fills gaps in `datasets/` for sessions the official Cambridge site no longer
serves publicly (it typically only keeps the most recent session or two).
savemyexams is a **third-party mirror, not an official source** — see the
caveats below before trusting it for anything beyond gap-filling.

## Usage

```bash
pnpm --filter @education-ai/worker collect:savemyexams <qualification> <subject> <syllabus-code>

# Example
pnpm --filter @education-ai/worker collect:savemyexams igcse physics 0625
```

`<qualification>` and `<subject>` are savemyexams URL slugs (lowercase,
hyphenated), used to build
`https://www.savemyexams.com/<qualification>/<subject>/cie/past-papers/`.
`<syllabus-code>` is **yours** — it determines which `datasets/` folder files
land in and is *not* scraped from the page (see "Syllabus code" below).

## How discovery works

savemyexams doesn't host PDFs itself — its past-papers page is a Next.js app
that embeds the full paper listing as JSON in a `#__NEXT_DATA__` script tag
(`pageProps.pastPapers`). Each record carries direct `exam_paper` /
`mark_scheme` URLs pointing to the real origin (sometimes
`cambridgeinternational.org` directly, sometimes a mirror like
`pastpapers.co` or `cienotes.com`). `collect-course.ts` parses that JSON;
`collect-resources.ts` classifies each record and maps it onto the exact same
`DocumentResource` shape the Cambridge job uses, so downloads land in the
same `datasets/<board>/<qualification>/<subject>/<syllabusCode>/...` tree via
the same `download`/`store` code.

## Extending to other subjects, qualifications, or boards

**New subject, same qualification/board** (e.g. Chemistry instead of
Physics): no code change — just pass a different subject slug and syllabus
code (`collect:savemyexams igcse chemistry 0620`).

**New qualification, same board** (e.g. A-Level instead of IGCSE): also no
code change — `collect:savemyexams a-level physics 9702`. Verified that
`https://www.savemyexams.com/a-level/physics/aqa/past-papers/` and
`.../gcse/physics/edexcel/past-papers/` both resolve with the same
`__NEXT_DATA__` shape, so the parsing layer shouldn't need changes — only the
board slug (next point) is CIE-specific right now.

**New board** (Edexcel/AQA/OCR): requires code changes:

1. Extend the `Board` union in `../cambridge/types.ts` (uncomment the
   relevant placeholder, e.g. `| "Edexcel"`).
2. Add the new board's prefix to `BOARD_PREFIXES` in
   `../cambridge/lib/board-prefix.ts`.
3. Add a board-slug mapping here (this iteration hardcodes `cie` in
   `index.ts`'s `buildPageUrl`) — e.g.
   `{ Cambridge: 'cie', Edexcel: 'edexcel', AQA: 'aqa', OCR: 'ocr' }`, which
   are savemyexams' own URL slugs.
4. Re-verify the `__NEXT_DATA__` shape for that board's page before trusting
   the parser blindly — it was only confirmed against the CIE IGCSE Physics
   page. Other boards may have field differences (e.g. AQA tiers, OCR
   component codes) worth spot-checking first.

## Caveats

- **Syllabus code**: savemyexams stamps every individual paper's own `code`
  field with a single syllabus code (e.g. `"0972/11"`) even when its course
  record covers two syllabuses at once (e.g. `exam_code: "0625 & 0972"` for
  Cambridge IGCSE Physics, where 0625/0972 are the same papers under two
  grading scales). Don't trust the per-paper code for foldering — always pass
  the syllabus code you actually want explicitly.
- **Not an official source**: papers ultimately come from a mix of the
  official Cambridge domain and third-party mirrors (`pastpapers.co`,
  `cienotes.com`, `pastpapers.papacambridge.com`), with no stated licensing
  or provenance guarantee from savemyexams itself. Use this job to fill gaps,
  not as a replacement for `apps/worker/src/jobs/cambridge/`.
- **Duplicate-asset-id risk**: Cambridge occasionally re-uploads the same
  document under a new CDN asset id. A paper already on disk from the
  official pipeline can therefore get re-downloaded here under a different
  filename instead of being skipped, since idempotency is URL-based. Not
  solved automatically — would need content-hash dedup.
