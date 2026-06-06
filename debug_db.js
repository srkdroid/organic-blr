const { Pool } = require('pg');
require('dotenv').config({ path: 'scraper/.env.scraper' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const res = await pool.query("SELECT * FROM provider_listings WHERE master_item_id = (SELECT id FROM master_items WHERE canonical_name = 'Cluster Beans')");
  
  const prices = res.rows;
  console.log(prices.map(p => ({ p: p.provider_id, pr: p.price, u: p.unit })));

  const { enrichPrices } = await import('./lib/providers.js');
  const enriched = enrichPrices([{ master_item_id: 1, prices }]);
  console.log(enriched[0].prices.map(p => ({ p: p.provider_id, pr: p.price, u: p.unit, ppk: p.price_per_kg })));
  
  process.exit(0);
}
test();
