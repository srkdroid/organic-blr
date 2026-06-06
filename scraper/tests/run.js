/**
 * scraper/tests/run.js
 * Smoke tests — no network, no DB.
 * Run: npm test
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const {
  parsePrice,
  parseUnit,
  extractUnit,
  deduplicateProducts,
  buildProduct,
} = require("../utils/index");
const { fuzzyMatch } = require("../normalizer/index");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ── parsePrice ────────────────────────────────────────────────────────────────
console.log("\n── parsePrice");
assert(parsePrice("Rs. 45") === 45, "Rs. 45 → 45");
assert(parsePrice("Rs49") === 49, "Rs49 → 49");
assert(parsePrice("₹ 45.00") === 45, "₹ 45.00 → 45");
assert(parsePrice("₹49") === 49, "₹49 → 49");
assert(parsePrice("45") === 45, '"45" → 45');
assert(parsePrice("₹1,299") === 1299, "₹1,299 → 1299");
assert(
  parsePrice("Rs49\n\n- 500gm") === 49,
  "Rs49\\n\\n- 500gm → 49 (HB format)",
);
assert(parsePrice(null) === null, "null → null");
assert(parsePrice("") === null, "empty → null");

// ── parseUnit ─────────────────────────────────────────────────────────────────
console.log("\n── parseUnit");
assert(parseUnit("500 gms") === "500g", "500 gms → 500g");
assert(parseUnit("1 Kg") === "1kg", "1 Kg → 1kg");
assert(parseUnit("1 bunch") === "1 bunch", "1 bunch → 1 bunch");
assert(parseUnit("6 pcs") === "6pcs", "6 pcs → 6pcs");
assert(parseUnit("500g") === "500g", "500g unchanged");
assert(parseUnit(null) === null, "null → null");

// ── extractUnit ───────────────────────────────────────────────────────────────
console.log("\n── extractUnit");
assert(extractUnit("Tomato 500g") === "500g", '"Tomato 500g" → 500g');
assert(extractUnit("Carrot - 1 kg") === "1kg", '"Carrot - 1 kg" → 1kg');
assert(extractUnit("Banana (6 pcs)") === "6pcs", '"Banana (6 pcs)" → 6pcs');
assert(extractUnit("Spinach - 1 Bunch") === "1 bunch", '"Spinach - 1 Bunch" → 1 bunch');
assert(extractUnit("Rs 39\n- 250g") === "250g", '"Rs 39\n- 250g" → 250g (price text)');
assert(extractUnit("Rs. 45.00") === null, '"Rs. 45.00" → null (no unit suffix)');
assert(extractUnit("Bitter Gourd") === null, '"Bitter Gourd" → null (no unit)');
assert(extractUnit(null) === null, "null → null");

// ── buildProduct ──────────────────────────────────────────────────────────────
console.log("\n── buildProduct");
const p = buildProduct({
  providerId: "HB",
  name: "Tomato",
  price: "Rs49",
  unit: "500 gms",
});
assert(p.providerId === "HB", "providerId set");
assert(p.name === "Tomato", "name set");
assert(p.price === 49, "price parsed from Rs49");
assert(p.unit === "500g", "unit normalised");
assert(typeof p.scrapedAt === "string", "scrapedAt set");

// ── deduplicateProducts ───────────────────────────────────────────────────────
console.log("\n── deduplicateProducts");
const dupes = [
  buildProduct({ providerId: "HB", name: "Tomato", price: "45", unit: "500g" }),
  buildProduct({ providerId: "HB", name: "Tomato", price: "50", unit: "500g" }),
  buildProduct({ providerId: "HB", name: "Carrot", price: "55", unit: "500g" }),
];
assert(
  deduplicateProducts(dupes).length === 2,
  "removes duplicate name+unit pairs",
);

// ── fuzzyMatch ────────────────────────────────────────────────────────────────
console.log("\n── fuzzyMatch");
const masterItems = [
  { id: 1, canonical_name: "Tomato", aliases: ["tomato", "tamatar"] },
  { id: 2, canonical_name: "Beans", aliases: ["beans", "french beans"] },
  {
    id: 3,
    canonical_name: "Spinach",
    aliases: ["spinach", "palak", "fresh palak"],
  },
];
const testProducts = [
  buildProduct({ providerId: "HB", name: "Tomato", price: "45", unit: "500g" }),
  buildProduct({
    providerId: "HB",
    name: "Fresh Palak",
    price: "30",
    unit: "1 bunch",
  }),
  buildProduct({
    providerId: "HB",
    name: "XYZUNKNOWN999",
    price: "99",
    unit: "1pc",
  }),
];
const { matched, unmatched } = fuzzyMatch(testProducts, masterItems);
assert(matched.length >= 1, `fuzzyMatch: ≥1 matched (got ${matched.length})`);
assert(
  unmatched.length >= 1,
  `fuzzyMatch: ≥1 unmatched (got ${unmatched.length})`,
);
assert(
  matched.find((m) => m.masterItemId === 1) !== undefined,
  "Tomato → masterItemId 1",
);

// ── Normaliser: HB bean names ─────────────────────────────────────────────────
console.log("\n── Normaliser: HB-specific names");
const { localDictMatch } = require("../normalizer/index");
const hbNames = [
  "Beans - Cluster",
  "Beans - Dark Green Small",
  "Beans - Flat",
  "Long Beans",
  "Double Beans",
  "Gourd - Bitter",
  "Gourd - Bottle",
  "Gourd - Snake",
  "Drum Stick",
  "Chow Chow (Seemebadnekai)",
  "Cocinia (Tonde / Kunduru)",
  "Togari Kayi (Green Toordal)",
  "Turkey Berry (Sundakkai)",
  "Knol Khol (Kohlrabi)",
  "Sambar Onion (Cheriya Ulli)",
  "Cherry Tomato (OVAL)",
  "Banana Stem",
  "Banana Flower",
  "Assam Lemon (Kaji Nemu)",
];
const hbProducts = hbNames.map((n) =>
  buildProduct({ providerId: "HB", name: n, price: "50", unit: "250g" }),
);
const { matched: hbMatched, unmatched: hbUnmatched } = localDictMatch(hbProducts);

hbMatched.forEach((p) => {
  console.log(`  ✓ "${p.name}" → ${p.masterName}`);
  passed++;
});
hbUnmatched.forEach((p) => {
  console.error(`  ✗ "${p.name}" → UNMATCHED`);
  failed++;
});

// Verify the critical fix: "Beans - Dark Green Small" must map to "Dark Green Beans"
const darkGreen = hbMatched.find((p) => p.name === "Beans - Dark Green Small");
assert(
  darkGreen && darkGreen.masterName === "Dark Green Beans",
  '"Beans - Dark Green Small" → "Dark Green Beans" (not generic "Beans")',
);

// ── Cart total logic ──────────────────────────────────────────────────────────
console.log("\n── Cart total logic");
function mockTotal(subtotal, charge, freeAbove, gst) {
  const delivery = freeAbove === 0 || subtotal >= freeAbove ? 0 : charge;
  const sub = subtotal + delivery;
  return Math.round((sub + sub * gst) * 100) / 100;
}
assert(mockTotal(500, 0, 0, 0.05) === 525, "AK: ₹500 + free + 5% GST = ₹525");
assert(
  mockTotal(600, 40, 1000, 0.05) === 672,
  "HB: ₹600 + ₹40 del + 5% GST = ₹672",
);
assert(
  mockTotal(1200, 40, 1000, 0.05) === 1260,
  "HB: ₹1200 free del + 5% GST = ₹1260",
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(44)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(44)}\n`);
if (failed > 0) process.exit(1);
