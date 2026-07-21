import { chromium } from "playwright";
export type RawResource ={
  title: string;
  url: string;
}
export async function crawl(url: string): Promise<RawResource[]> {
  console.log('[crawl] lauching chrome instance...')
  const browser = await chromium.launch({
    headless: true,
  });
  
  try {
    console.log('[crawl] opening new page...')
    const page = await browser.newPage();
    
    console.log('[crawl] opening the url:',url)
    await page.goto(url, {
      waitUntil: "networkidle",
    });
    
    console.log('[crawl]: waitning for the page to finish rendering')
    await page.waitForTimeout(2000);
    
    console.log('[crawl]: Grabbing links')
    const resources = await page.$$eval("a", (anchors) => {
      return anchors
      .map((anchor) => ({
        title: anchor.textContent?.trim() ?? "",
        url: anchor.href,
      }))
      .filter(
        (resource) =>
          resource.title.length > 0 &&
        resource.url.toLowerCase().endsWith(".pdf")
      );
    });
    
    console.log('[crawl]: removing duplicates')
    return resources.filter(
      (resource, index, array) =>
        index === array.findIndex((r) => r.url === resource.url)
    );
  } finally {
    await browser.close();
  }
}