const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://organicmandya.com/products/organic-red-globe-grapes');
  try {
    const btn = await page.locator('button[name="add"]').textContent();
    console.log('Add to cart button:', btn.trim());
  } catch (e) { console.log(e.message); }
  await browser.close();
}
run();
