/**
 * DEBUG — prints raw item JSON from Farm Fresh UpMarket API
 * Run: node scraper/debug_farmfresh2.js
 */

const axios = require("axios");

const API_URL = "https://farmfreshbangalore.com/getGroup";
const ORG_ID = "AA0062";

async function fetchSample(name) {
  console.log(`\nPOSTing to ${API_URL} with name="${name}"...`);

  const res = await axios.post(
    API_URL,
    {
      orgId: ORG_ID,
      name,
      pageId: 1,
      records: 5,
      style: "style-21",
      scope: "local",
    },
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: `https://farmfreshbangalore.com/collections/${name}`,
        Origin: "https://farmfreshbangalore.com",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      },
      timeout: 20000,
    },
  );

  console.log("HTTP status:", res.status);
  console.log("Response top-level keys:", Object.keys(res.data));
  console.log("data keys:", Object.keys(res.data?.data || {}));

  const items = res.data?.data?.items;
  console.log(
    "items type:",
    typeof items,
    Array.isArray(items) ? `array[${items.length}]` : "",
  );

  if (Array.isArray(items) && items.length > 0) {
    console.log("\nFIRST ITEM (full JSON):");
    console.log(JSON.stringify(items[0], null, 2));
    console.log("\nSECOND ITEM (full JSON):");
    if (items[1]) console.log(JSON.stringify(items[1], null, 2));
  } else {
    console.log("No items found. Full response:");
    console.log(JSON.stringify(res.data, null, 2).slice(0, 2000));
  }
}

(async () => {
  try {
    await fetchSample("vegetables");
    await fetchSample("fruits");
  } catch (err) {
    console.error("\nERROR:", err.message);
    if (err.response) {
      console.error("HTTP status:", err.response.status);
      console.error(
        "Response data:",
        JSON.stringify(err.response.data, null, 2).slice(0, 500),
      );
    } else if (err.request) {
      console.error("No response received (network error or timeout)");
    }
  }
  process.exit(0);
})();
