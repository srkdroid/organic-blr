/**
 * lib/providers.js
 * Shared provider metadata — used by API routes (server) AND React components (client).
 *
 * Provider roster (verified May 2026):
 *   HB — Healthy Buddha       — OpenCart, Playwright scraper
 *   OM — Organic Mandya       — Shopify, products.json
 *   LU — Lushful              — Custom REST API, axios
 *   AK — Satva Farm           — Shopify, products.json (replaced Akshayakalpa)
 *   FF — Farm Fresh Bangalore — Shopify SPA (products.json disabled), Playwright
 *   GD — GreenDNA             — Shopify, products.json
 */

export const PROVIDERS = {
  HB: {
    id: "HB",
    name: "Healthy Buddha",
    color: "#059669",
    bg: "#d1fae5",
    url: "healthybuddha.in",
    deliveryCharge: 40,
    freeAbove: 1000,
    minOrder: 399,
  },
  OM: {
    id: "OM",
    name: "Organic Mandya",
    color: "#2563eb",
    bg: "#dbeafe",
    url: "organicmandya.com",
    deliveryCharge: 30,
    freeAbove: 500,
    minOrder: 200,
  },
  LU: {
    id: "LU",
    name: "Lushful",
    color: "#dc2626",
    bg: "#fee2e2",
    url: "lushful.org",
    deliveryCharge: 35,
    freeAbove: 599,
    minOrder: 300,
  },
  AK: {
    id: "AK",
    name: "Satva Farm",
    color: "#7c3aed",
    bg: "#ede9fe",
    url: "satvafarm.com",
    deliveryCharge: 0,
    freeAbove: 500,
    minOrder: 0,
    note: "Delivers Wed & Sat in Bengaluru. Order by 12pm day before.",
  },
  FF: {
    id: "FF",
    name: "Farm Fresh Bangalore",
    color: "#d97706",
    bg: "#fef3c7",
    url: "farmfreshbangalore.com",
    deliveryCharge: 0,
    freeAbove: 500,
    minOrder: 500,
  },
  GD: {
    id: "GD",
    name: "GreenDNA",
    color: "#0891b2",
    bg: "#cffafe",
    url: "greendna.in",
    deliveryCharge: 30,
    freeAbove: 500,
    minOrder: 250,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export const CATEGORIES = [
  "All",
  "Vegetables",
  "Fruits",
  "Leafy Greens",
  "Herbs",
  "Exotic",
];

export const CAT_COLORS = {
  Vegetables: { bg: "#dcfce7", text: "#166534" },
  Fruits: { bg: "#fef9c3", text: "#713f12" },
  "Leafy Greens": { bg: "#cffafe", text: "#164e63" },
  Herbs: { bg: "#ede9fe", text: "#4c1d95" },
  Exotic: { bg: "#fce7f3", text: "#831843" },
  Unknown: { bg: "#f3f4f6", text: "#374151" },
};

export const GST_RATE = 0.05;

export function calcDelivery(subtotal, providerId) {
  const p = PROVIDERS[providerId];
  if (!p) return 0;
  if (p.freeAbove === 0) return 0;
  return subtotal < p.freeAbove ? p.deliveryCharge : 0;
}

export function enrichPrices(items) {
  return items.map((item) => ({
    ...item,
    prices: (item.prices || []).map((p) => {
      const cfg = PROVIDERS[p.provider_id] || {};
      return {
        ...p,
        delivery_charge: cfg.deliveryCharge ?? 0,
        free_delivery_above: cfg.freeAbove ?? null,
        min_order: cfg.minOrder ?? 0,
        gst_rate: GST_RATE,
      };
    }),
  }));
}
