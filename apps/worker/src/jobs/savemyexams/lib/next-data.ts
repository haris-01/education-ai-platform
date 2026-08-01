import * as cheerio from 'cheerio'

/**
 * savemyexams is a Next.js app; every page embeds its full server-fetched
 * data as JSON in a `#__NEXT_DATA__` script tag. Parsing that is far more
 * reliable than scraping visible link text/hrefs — it's the same data the
 * page was rendered from, including fields (year, month, paper code) that
 * never appear in the rendered HTML at all.
 */
export function extractNextData(html: string): unknown {
  const $ = cheerio.load(html)
  const json = $('#__NEXT_DATA__').html()

  if (!json) {
    throw new Error('Could not find __NEXT_DATA__ script tag on page')
  }

  return JSON.parse(json)
}
