/**
 * scraper/scheduler/cron.js
 * Fires the full scrape cycle at 6:00 AM and 4:00 PM IST every day.
 * Keep this running with: npm run scheduler
 * Or in background with: pm2 start scraper/scheduler/cron.js --name organic-cron
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const cron       = require('node-cron')
const { logger } = require('../utils/index')
const { runAll } = require('./runAll')

let isRunning = false

async function triggerRun(label) {
  if (isRunning) {
    logger.warn(`[Cron] ${label} skipped — previous run still in progress`)
    return
  }
  isRunning = true
  logger.info(`[Cron] ${label} starting`)
  try {
    await runAll()
  } catch (err) {
    logger.error(`[Cron] ${label} failed`, { error: err.message })
  } finally {
    isRunning = false
  }
}

// 6:00 AM IST
const morningJob = cron.schedule(
  '0 6 * * *',
  () => triggerRun('Morning run (6:00 AM IST)'),
  { timezone: 'Asia/Kolkata' }
)

// 4:00 PM IST
const eveningJob = cron.schedule(
  '0 16 * * *',
  () => triggerRun('Evening run (4:00 PM IST)'),
  { timezone: 'Asia/Kolkata' }
)

logger.info('[Cron] Scheduler started — runs at 6:00 AM and 4:00 PM IST daily')
logger.info('[Cron] Press Ctrl+C to stop')

// Graceful shutdown
process.on('SIGTERM', () => { morningJob.stop(); eveningJob.stop(); process.exit(0) })
process.on('SIGINT',  () => { morningJob.stop(); eveningJob.stop(); process.exit(0) })
