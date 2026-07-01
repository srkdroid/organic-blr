/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Node-only scraper packages out of the browser bundle
  experimental: {
    serverComponentsExternalPackages: ['pg', 'playwright', 'winston', 'node-cron', 'dotenv'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: '**.myshopify.com' },
    ],
  },
}

module.exports = nextConfig
