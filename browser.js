/**
 * scraper/utils/browser.js
 * Singleton Playwright browser shared across all browser-based scrapers.
 */

const { chromium } = require('playwright')
const { logger, randomUserAgent } = require('./index')

let _browser = null

async function getBrowser() {
  if (_browser) return _browser
  logger.info('Launching Chromium browser')
  _browser = await chromium.launch({
    headless: process.env.SCRAPE_HEADLESS !== 'false',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
    ],
  })
  _browser.on('disconnected', () => {
    logger.warn('Browser disconnected unexpectedly')
    _browser = null
  })
  return _browser
}

async function newContext() {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent:    randomUserAgent(),
    viewport:     { width: 1440, height: 900 },
    locale:       'en-IN',
    timezoneId:   'Asia/Kolkata',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8',
    },
  })
  // Block images, fonts, media to speed up scraping
  await context.route('**/*', route => {
    const type = route.request().resourceType()
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) return route.abort()
    return route.continue()
  })
  return context
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close()
    _browser = null
    logger.info('Browser closed')
  }
}

async function waitForSelectorSafe(page, selector, timeoutMs = 10_000) {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

async function scrollToBottom(page, { pauseMs = 800, maxScrolls = 15 } = {}) {
  for (let i = 0; i < maxScrolls; i++) {
    const prev = await page.evaluate(() => document.body.scrollHeight)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(pauseMs)
    const next = await page.evaluate(() => document.body.scrollHeight)
    if (next === prev) break
  }
}

module.exports = { getBrowser, newContext, closeBrowser, waitForSelectorSafe, scrollToBottom }
