# Organic Bangalore — Complete Setup & Deployment Guide
## From zero to a live mobile-first app on the internet

**Stack:** Next.js 14 · Supabase (PostgreSQL) · Vercel · Local scraper in VS Code  
**Cost:** ₹0 to start  
**Time:** ~60 minutes for first-time setup

---

## What you will have running

```
Your Laptop (VS Code)                Supabase               Vercel (Internet)
┌────────────────────────┐          ┌──────────────┐       ┌──────────────────┐
│  scraper/              │  writes  │              │       │  Next.js App     │
│  ├─ scrapers/ (×6)     │─────────▶│  PostgreSQL  │◀──────│  app/ + api/     │
│  ├─ scheduler/runAll.js│          │  (free tier) │       │                  │
│  └─ scheduler/cron.js  │          │              │       │  your-app        │
│                        │          │  Supabase    │       │  .vercel.app     │
│  Runs 6AM + 4PM daily  │          │  Dashboard   │       │                  │
└────────────────────────┘          └──────────────┘       └──────────────────┘
```

---

# PART 1 — Install tools on your laptop

## Step 1 — Install Node.js

Download from https://nodejs.org → choose the **LTS** version (18 or higher).

After installing, open a terminal and verify:
```
node --version    # must show v18.x.x or higher
npm --version     # must show 9.x or higher
```

**Windows users:** After installing Node, close and reopen any terminal windows.

## Step 2 — Install Git

Download from https://git-scm.com/downloads and install with default options.

## Step 3 — Install VS Code

Download from https://code.visualstudio.com and install.

---

# PART 2 — Open the project

## Step 4 — Open the folder in VS Code

1. Copy the `organic-bangalore` folder to your preferred location
   - Windows: `C:\Projects\organic-bangalore`
   - Mac/Linux: `~/Projects/organic-bangalore`

2. Open VS Code → **File → Open Folder** → select `organic-bangalore`

3. VS Code may ask "Do you trust the authors?" → click **Yes, I trust the authors**

4. VS Code will show a notification: **"Do you want to install the recommended extensions?"**
   → Click **Install**. This adds Prettier, Tailwind IntelliSense, SQLTools, etc.

5. Open the integrated terminal: **Terminal → New Terminal** (or Ctrl+` / Cmd+`)

---

# PART 3 — Set up Supabase (your cloud database)

## Step 5 — Create a Supabase account and project

1. Go to **https://supabase.com** and click **Start your project** (free, no credit card)
2. Sign up with GitHub or email
3. Click **New project** and fill in:
   - **Organization**: your name or "Personal"
   - **Project name**: `organic-bangalore`
   - **Database password**: choose a strong password — **write it down now**, you'll need it
   - **Region**: `ap-south-1 (Mumbai)` — closest to Bangalore
4. Click **Create new project**
5. Wait 2–3 minutes for the project to provision (you'll see a loading bar)

## Step 6 — Get your two connection strings

Once your project is ready:

1. In the left sidebar, click **Settings** (gear icon at the very bottom)
2. Click **Database** in the settings menu
3. Scroll down to the **Connection string** section

You need to copy **two different URLs**:

### URL 1 — Transaction Pooler (for Vercel)
Click the **Transaction** tab. The URL looks like:
```
postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```
Copy this. You'll use it in `.env.local`.

### URL 2 — Direct Connection (for local scraper)
Click the **Session** tab (or **Direct connection**). The URL looks like:
```
postgresql://postgres.abcdefghijk:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```
Copy this. You'll use it in `scraper/.env.scraper`.

> **Why two URLs?** The Transaction Pooler (port 6543) is optimised for
> Vercel's short-lived serverless functions. The Direct connection (port 5432)
> is better for the local scraper which keeps a persistent connection.

---

# PART 4 — Configure local environment files

## Step 7 — Create .env.local (for Next.js)

In VS Code terminal, from the project root:

**Mac/Linux:**
```bash
cp .env.local.example .env.local
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.local.example .env.local
```

Now open `.env.local` (click it in the file explorer on the left) and fill in:

```env
DATABASE_URL=postgresql://postgres.xxxx:[password]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SCRAPE_TRIGGER_SECRET=pick_any_secret_string_eg_mango2024
GST_RATE=0.05
NEXT_PUBLIC_APP_NAME=Organic Bangalore
```

Replace:
- `postgres.xxxx` with your actual project ref from the Supabase URL
- `[password]` with the database password you set in Step 5
- The `SCRAPE_TRIGGER_SECRET` with any string you'll remember (e.g. `mango2024`)

## Step 8 — Create scraper/.env.scraper (for the local scraper)

**Mac/Linux:**
```bash
cp scraper/.env.scraper.example scraper/.env.scraper
```

**Windows:**
```powershell
Copy-Item scraper\.env.scraper.example scraper\.env.scraper
```

Open `scraper/.env.scraper` and fill in:

```env
DATABASE_URL=postgresql://postgres.xxxx:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
SCRAPE_HEADLESS=true
SCRAPE_TIMEOUT_MS=30000
```

Use the **Direct connection URL** (port **5432**) here — NOT the pooler URL.

---

# PART 5 — Install dependencies and run tests

## Step 9 — Install npm packages

In the VS Code terminal:
```bash
npm install
```

This installs everything — Next.js, React, Playwright, pg, etc. Takes 1–2 minutes.

## Step 10 — Install Playwright's browser (Chromium)

```bash
npx playwright install chromium
```

This downloads ~130 MB of Chromium browser used by the scraper. Only needed once.

## Step 11 — Run smoke tests

```bash
npm test
```

You should see:
```
── parsePrice
  ✓ Rs. 45 → 45
  ✓ ₹ 45.00 → 45
  ... (28 tests total)

══════════════════════════════════════════
  Results: 28 passed, 0 failed
══════════════════════════════════════════
```

If any tests fail, double-check that `scraper/.env.scraper` exists.

---

# PART 6 — Set up the database

## Step 12 — Create tables in Supabase

```bash
node scraper/db/migrate.js
```

Expected output:
```
[DB] Running migrations against Supabase...
[DB] ✓ All tables created / verified
[DB] ✓ Provider rows seeded
```

**Verify in Supabase dashboard:**
1. Go to https://supabase.com → your project → **Table Editor** (left sidebar)
2. You should see these tables: `master_items`, `provider_listings`,
   `price_history`, `scrape_runs`, `providers`
3. Click `providers` — you should see 6 rows (HB, OM, LU, AK, FF, GD)

---

# PART 7 — Run the app locally

## Step 13 — Start the Next.js dev server

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 14.2.5
  - Local: http://localhost:3000
```

Open http://localhost:3000 in your browser.

The app loads but shows **"No prices yet"** — that's correct. The database is
empty. The next step fills it.

## Step 14 — Run your first scrape

Open a **second terminal** (click the **+** button in the terminal panel).

Start with the two fastest providers — Shopify JSON, no browser needed:
```bash
npm run scrape:organicmandya
```
Watch the output. You should see products being fetched and saved.

```bash
npm run scrape:lushful
```

Then the WooCommerce one:
```bash
npm run scrape:farmfresh
```

Now go back to http://localhost:3000 and **refresh the page**. Prices appear!

Then run the browser-based scrapers (Playwright opens Chromium — 2–3 min each):
```bash
npm run scrape:healthybuddha
npm run scrape:akshayakalpa
npm run scrape:greendna
```

Or run all 6 at once:
```bash
npm run scrape:all
```

### Debug mode (watching the browser)

To watch Chromium open and see what the scraper is doing, set in `scraper/.env.scraper`:
```
SCRAPE_HEADLESS=false
```
Then run a browser-based scraper via **F5 → 🕷 Scrape: Healthy Buddha** in VS Code.
A browser window opens and you can see exactly what's being scraped.
Set it back to `true` when done.

---

# PART 8 — Deploy to Vercel (go live on the internet)

## Step 15 — Create a GitHub repository

1. Go to https://github.com and sign in (create an account if needed)
2. Click **+** (top right) → **New repository**
3. Settings:
   - **Repository name**: `organic-bangalore`
   - **Visibility**: Private (keeps your code private)
   - Leave "Initialize repository" **unchecked**
4. Click **Create repository**
5. GitHub shows you a set of commands. In your VS Code terminal:

```bash
git init
git add .
git commit -m "Initial commit — Organic Bangalore price comparator"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/organic-bangalore.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username.

> **Note:** `.env.local` and `scraper/.env.scraper` are listed in `.gitignore`
> and will NOT be pushed to GitHub. Your passwords stay on your machine only.

## Step 16 — Deploy to Vercel

### Create a Vercel account
Go to https://vercel.com → **Sign up** → choose **Continue with GitHub**
(sign in with the same GitHub account from Step 15)

### Import your project
1. On the Vercel dashboard, click **Add New → Project**
2. You'll see your `organic-bangalore` repository listed → click **Import**
3. Vercel auto-detects Next.js — leave all framework settings as-is

### Add environment variables (IMPORTANT — do this before deploying)
Scroll down to **Environment Variables** and add these **4 variables**:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your **Transaction Pooler** URL from Supabase (port **6543**) |
| `SCRAPE_TRIGGER_SECRET` | Same value you put in `.env.local` |
| `GST_RATE` | `0.05` |
| `NEXT_PUBLIC_APP_NAME` | `Organic Bangalore` |

For `DATABASE_URL`: use the **6543 pooler URL** (NOT the 5432 direct URL).
This is critical for Vercel's serverless functions.

### Deploy
Click **Deploy**. Vercel will:
1. Pull your code from GitHub
2. Run `npm install` and `npm run build`
3. Deploy to a URL like `https://organic-bangalore-abc123.vercel.app`

Build takes about 60–90 seconds. When it turns green, click **Visit**.

🎉 **Your app is now live on the internet.**

---

# PART 9 — Set up automatic scraping

## Step 17 — Keep scrapes running automatically

The cron scheduler fires at **6:00 AM** and **4:00 PM IST** daily.
Run it in VS Code whenever your laptop is on:

```bash
npm run scheduler
```

Or launch via **F5 → ⏰ Start cron scheduler** in VS Code.

**To run it silently in the background** (so you can close the terminal):

Install PM2 (a process manager):
```bash
npm install -g pm2
```

Start the scheduler:
```bash
pm2 start scraper/scheduler/cron.js --name organic-cron
pm2 save
```

Now the scheduler runs silently. Check its status anytime:
```bash
pm2 status
pm2 logs organic-cron
```

Stop it:
```bash
pm2 stop organic-cron
```

## Step 18 — After each local scrape: bust the Vercel cache

After running a scrape locally, Vercel's cached pages don't know there's new data.
To show fresh prices immediately:

**Option A — From the live app UI:**
In your live app (https://your-app.vercel.app):
1. Click the **🔄** button in the header
2. Enter your `SCRAPE_TRIGGER_SECRET`
3. Click **Go** — cache is cleared, fresh data shows on next page load

**Option B — Automatically at end of scrape:**
After running `npm run scrape:all`, you can also call:
```bash
curl -X POST https://your-app.vercel.app/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"secret":"your_secret_here"}'
```

> Without busting the cache, new prices appear naturally within 10 minutes
> anyway (ISR revalidation). The cache bust just makes it immediate.

---

# PART 10 — Optional: custom domain

## Step 19 — Add a custom domain (optional)

If you want `organicblr.in` instead of the Vercel URL:

1. Buy a domain (~₹800/year for `.in`) from:
   - BigRock: https://www.bigrock.in
   - GoDaddy: https://www.godaddy.com/en-in
   - Hostinger: https://www.hostinger.in

2. In Vercel: **Project → Settings → Domains → Add**

3. Type your domain name, click **Add**

4. Follow the DNS configuration instructions shown — typically you add a CNAME
   record pointing to `cname.vercel-dns.com` in your domain registrar's dashboard

5. Takes 10–60 minutes for DNS to propagate

## Step 20 — Add to home screen (PWA)

Your app is already configured as a Progressive Web App. Tell your users:

**Android (Chrome):**
1. Open the app in Chrome
2. Tap ⋮ (three dots) → **Add to Home screen**
3. Tap **Add** — app installs with the 🥦 icon, opens full-screen

**iPhone (Safari):**
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Tap **Add to Home Screen** → **Add**

---

# PART 11 — Daily workflow after deployment

Once everything is deployed, your routine is:

**The app runs itself:**
- Scraper fires at 6 AM and 4 PM IST (while your laptop is on)
- Data is saved to Supabase
- Vercel serves fresh data within 10 minutes
- Users on mobile see prices without you doing anything

**You only need to act when:**
1. A provider changes their website (selectors break) → update `scraper/config/providers.js`
2. You want to add a new provider → add to `config/providers.js` + create new scraper
3. Vercel or Supabase needs an upgrade (see scaling section)

**To run a manual scrape at any time:**
```bash
npm run scrape:all
```

---

# PART 12 — Scaling up (when you need it)

## Free tier limits

| Service | Free limit | What happens if exceeded |
|---------|-----------|--------------------------|
| Supabase | Pauses after **7 days of inactivity** | Re-activate from dashboard |
| Supabase | 500 MB database | Upgrade to Pro |
| Vercel | 100 GB bandwidth/month | Upgrade to Pro |
| Vercel | 6,000 build minutes/month | Upgrade to Pro |

## How to prevent Supabase pausing

The free tier pauses if nobody hits the database for 7 days. Two options:

1. **Set up a keep-alive:** Add this to your scraper cron — run any query once a day even if not scraping
2. **Upgrade to Pro (₹830/month):** Removes the pause entirely

## Scale-up path (one click each)

| When | Action | Cost |
|------|--------|------|
| Supabase pausing is annoying | Supabase Pro | ₹830/month |
| >500 daily active users | Vercel Pro | ₹1,700/month |
| Both | Both upgrades | ~₹2,500/month |

Both upgrades are single-click in their dashboards. No code changes, no data migration, no new deployments.

---

# Troubleshooting

### "DATABASE_URL is not set"
Check that `scraper/.env.scraper` exists and has a `DATABASE_URL` line.
On Windows, make sure you ran `Copy-Item`, not tried to rename the file.

### "Cannot connect to database" / SSL errors
Your `DATABASE_URL` must include the Supabase hostname (contains `supabase.com`).
The code auto-enables SSL for Supabase connections.

### Vercel build fails: "Cannot find module 'playwright'"
This is expected — Playwright is for the local scraper only, not Vercel.
Check that `next.config.js` has:
```js
serverExternalPackages: ['pg', 'playwright', 'winston', 'node-cron', 'dotenv']
```

### Vercel shows "No prices yet" after deploying
The database is empty on first deploy. Run `npm run scrape:organicmandya` locally first,
then visit the live app. Data appears within seconds (or after a 🔄 cache bust).

### Vercel shows stale prices
Click 🔄 in the app header and enter your secret. Or wait up to 10 minutes for
ISR to auto-revalidate.

### Scraper returns 0 products for a browser-based provider
The provider may have updated their website. Debug mode:
1. Set `SCRAPE_HEADLESS=false` in `scraper/.env.scraper`
2. Run via **F5 → 🕷 Scrape: [Provider Name]** in VS Code
3. Watch the browser — identify the correct CSS selectors
4. Update them in `scraper/config/providers.js`
5. Set `SCRAPE_HEADLESS=true` again

### App works locally but not on Vercel
Most likely the `DATABASE_URL` environment variable on Vercel is wrong.
Check: Vercel dashboard → Project → Settings → Environment Variables.
Make sure it's the **6543 pooler URL**, set for the **Production** environment.

---

# Project structure (reference)

```
organic-bangalore/              ← Open this folder in VS Code
│
├── .env.local                  ← Your secrets for Next.js (NOT in Git)
├── .env.local.example          ← Template — copy to .env.local
├── .gitignore                  ← Excludes .env.local, .env.scraper, node_modules
├── package.json                ← All scripts (dev, build, scrape:*, test, etc.)
├── jsconfig.json               ← Enables @/ path alias
├── next.config.js              ← Next.js config
├── tailwind.config.js
├── postcss.config.js
│
├── app/                        ← Next.js App Router (runs on Vercel)
│   ├── layout.jsx              ← Root HTML, PWA metadata, Tailwind import
│   ├── globals.css             ← Tailwind + custom utilities
│   ├── page.jsx                ← Home page (server component, pre-fetches data)
│   └── api/
│       ├── health/route.js     ← GET /api/health
│       ├── providers/route.js  ← GET /api/providers
│       ├── items/route.js      ← GET /api/items (cached 10 min)
│       │   └── [id]/history/   ← GET /api/items/:id/history
│       ├── cart/route.js       ← POST /api/cart (delivery + GST totals)
│       └── scrape/route.js     ← POST /api/scrape (bust ISR cache)
│
├── components/                 ← React UI ('use client')
│   ├── PriceApp.jsx            ← Top-level state: items, cart, filters
│   ├── PriceTable.jsx          ← Desktop table + mobile card layout
│   ├── CartDrawer.jsx          ← Bottom sheet (mobile) / sidebar (desktop)
│   ├── FilterBar.jsx           ← Search input + scrollable category pills
│   ├── StatusBar.jsx           ← Provider freshness dots
│   └── ScrapeButton.jsx        ← Cache-bust trigger with secret input
│
├── lib/                        ← Shared code (server + client)
│   ├── db.js                   ← pg pool for Next.js (Supabase-aware)
│   └── providers.js            ← Provider config, delivery/GST logic
│
├── public/
│   └── manifest.json           ← PWA manifest (Add to Home Screen)
│
├── .vscode/
│   ├── launch.json             ← F5 debug configs for all scrapers + dev server
│   ├── settings.json           ← Editor settings
│   └── extensions.json         ← Recommended extensions
│
└── scraper/                    ← Local-only (never deployed to Vercel)
    ├── .env.scraper            ← Your scraper secrets (NOT in Git)
    ├── .env.scraper.example    ← Template — copy to .env.scraper
    ├── config/providers.js     ← Scraper URLs + CSS selectors per provider
    ├── scrapers/               ← 6 provider scrapers
    │   ├── organicMandya.js    ← Shopify JSON (fastest, no browser)
    │   ├── lushful.js          ← Shopify JSON (fastest, no browser)
    │   ├── farmFresh.js        ← Cheerio/WooCommerce (no browser)
    │   ├── healthyBuddha.js    ← Playwright SPA
    │   ├── akshayakalpa.js     ← Playwright + XHR intercept
    │   └── greenDNA.js         ← Playwright SPA
    ├── utils/
    │   ├── index.js            ← Logger, retry, price/unit parsers
    │   ├── browser.js          ← Playwright browser factory (singleton)
    │   └── shopifyScraper.js   ← Reusable Shopify JSON fetcher
    ├── normalizer/index.js     ← Fuzzy match + 70-item local dictionary
    ├── db/
    │   ├── migrate.js          ← Creates Supabase tables (run once)
    │   └── client.js           ← pg pool for scraper
    ├── scheduler/
    │   ├── runAll.js           ← Full scrape cycle orchestrator
    │   └── cron.js             ← Fires at 6 AM + 4 PM IST
    └── tests/run.js            ← 28 smoke tests (no network needed)
```
