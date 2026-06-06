/**
 * scraper/normalizer/index.js
 *
 * Maps raw provider product names → canonical master item names.
 * NO external API needed — fully local two-pass approach:
 *   Pass 1: Fuse.js fuzzy match against master_items already in DB
 *   Pass 2: Built-in produce dictionary (70+ items, Kannada/Hindi/Tamil aliases)
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.scraper') })
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local'), override: false })

const Fuse = require('fuse.js')
const { logger } = require('../utils/index')

const FUZZY_THRESHOLD = 0.55

// ── Produce dictionary ────────────────────────────────────────────────────────
const PRODUCE_DICT = [
  // Vegetables
  { canonical:'Tomato',           cat:'Vegetables',   aliases:['tomato','tamatar','natti tomato','country tomato','desi tomato','hybrid tomato','thakkali'] },
  { canonical:'Onion',            cat:'Vegetables',   aliases:['onion','vengayam','pyaz','red onion','white onion','small onion','shallot','eerulli'] },
  { canonical:'Potato',           cat:'Vegetables',   aliases:['potato','aloo','batata','urulaikizhangu','aalugadde'] },
  { canonical:'Carrot',           cat:'Vegetables',   aliases:['carrot','gajar','carotte','gajjar'] },
  { canonical:'Brinjal',          cat:'Vegetables',   aliases:['brinjal','eggplant','baingan','kathirikai','aubergine','badanekayi'] },
  { canonical:'Capsicum Green',   cat:'Vegetables',   aliases:['capsicum','green capsicum','bell pepper','shimla mirch','kodamilagai','donne menasinkayi'] },
  { canonical:'Capsicum Red',     cat:'Vegetables',   aliases:['red capsicum','red bell pepper','lal shimla mirch'] },
  { canonical:'Beans',            cat:'Vegetables',   aliases:['beans','french beans','green beans','avarekalu','valor papdi','huralikayi'] },
  { canonical:'Cucumber',         cat:'Vegetables',   aliases:['cucumber','kakdi','vellarikai','kheera','southekayi'] },
  { canonical:'Bitter Gourd',     cat:'Vegetables',   aliases:['bitter gourd','karela','pavakkai','bitter melon','hagalakayi'] },
  { canonical:'Bottle Gourd',     cat:'Vegetables',   aliases:['bottle gourd','lauki','sorakkai','dudhi','sorekayi'] },
  { canonical:'Ridge Gourd',      cat:'Vegetables',   aliases:['ridge gourd','turai','peerkangai','heerekayi'] },
  { canonical:'Pumpkin',          cat:'Vegetables',   aliases:['pumpkin','kaddu','poosanikai','ash gourd','white pumpkin','kumbalakayi'] },
  { canonical:'Lady Finger',      cat:'Vegetables',   aliases:['lady finger','okra','bhindi','vendakkai','ladies finger','bendekayi'] },
  { canonical:'Cauliflower',      cat:'Vegetables',   aliases:['cauliflower','phool gobhi','hookosu'] },
  { canonical:'Cabbage',          cat:'Vegetables',   aliases:['cabbage','bandh gobhi','muttaikose','ele kosu'] },
  { canonical:'Broccoli',         cat:'Vegetables',   aliases:['broccoli','hari gobhi','brokoli'] },
  { canonical:'Beetroot',         cat:'Vegetables',   aliases:['beetroot','beet','chukandar','beetroot','beeroot'] },
  { canonical:'Radish',           cat:'Vegetables',   aliases:['radish','mooli','mullangi','white radish','moolangi'] },
  { canonical:'Sweet Potato',     cat:'Vegetables',   aliases:['sweet potato','shakarkandi','sakaravalli','genasina gadde'] },
  { canonical:'Yam',              cat:'Vegetables',   aliases:['yam','kanda','senaikizhangu','elephant yam','suran','suvarna gedde'] },
  { canonical:'Drumstick',        cat:'Vegetables',   aliases:['drumstick','moringa','murungakkai','sahajan','nuggekayi'] },
  { canonical:'Raw Banana',       cat:'Vegetables',   aliases:['raw banana','green banana','raw plantain','vazhakai','bale kayi'] },
  { canonical:'Raw Papaya',       cat:'Vegetables',   aliases:['raw papaya','green papaya','kacha papita'] },
  { canonical:'Green Peas',       cat:'Vegetables',   aliases:['green peas','matar','pattani','peas','batani'] },
  { canonical:'Corn',             cat:'Vegetables',   aliases:['corn','maize','sweet corn','makka','bhutta','mekkejola'] },
  { canonical:'Cluster Beans',    cat:'Vegetables',   aliases:['cluster beans','gavar','kothavarangai','gawar phali','gorikai'] },
  { canonical:'Colocasia',        cat:'Vegetables',   aliases:['colocasia','arbi','taro','seppankizhangu','kesuvina gedde'] },
  { canonical:'Knol Khol',        cat:'Vegetables',   aliases:['knol khol','kohlrabi','noolkhol','navilu kosu'] },
  { canonical:'Snake Gourd',      cat:'Vegetables',   aliases:['snake gourd','pudalangai','padavalanga','padwal'] },
  { canonical:'Raw Jackfruit',    cat:'Vegetables',   aliases:['raw jackfruit','kathal','palakkai','halasina hannu'] },
  // Fruits
  { canonical:'Banana',           cat:'Fruits',       aliases:['banana','kela','vazhai','robusta banana','elakki banana','poovan','bale hannu','nenthra'] },
  { canonical:'Nendran Banana',   cat:'Fruits',       aliases:['nendran','nendran banana','nendran pazham','kerala banana'] },
  { canonical:'Papaya',           cat:'Fruits',       aliases:['papaya','papita','pappali','ripe papaya','parangi hannu'] },
  { canonical:'Mango',            cat:'Fruits',       aliases:['mango','aam','manga','totapuri','alphonso','banginapalli','raspuri','badami','malgova','mavinahannu'] },
  { canonical:'Guava',            cat:'Fruits',       aliases:['guava','amrood','peru','koyya','seebe hannu'] },
  { canonical:'Pomegranate',      cat:'Fruits',       aliases:['pomegranate','anar','mathalam','dalimba','dalimbe'] },
  { canonical:'Sapota',           cat:'Fruits',       aliases:['sapota','chikoo','sapodilla','chiku','chickoo','chikku','sapote'] },
  { canonical:'Watermelon',       cat:'Fruits',       aliases:['watermelon','tarbooz','tharpoosani','kallangadi'] },
  { canonical:'Muskmelon',        cat:'Fruits',       aliases:['muskmelon','kharbuja','cantaloupe','karbuja','kharbuz'] },
  { canonical:'Pineapple',        cat:'Fruits',       aliases:['pineapple','ananas','annanasi','ananas'] },
  { canonical:'Coconut',          cat:'Fruits',       aliases:['coconut','nariyal','thengai','tender coconut','kobbari'] },
  { canonical:'Lemon',            cat:'Fruits',       aliases:['lemon','nimbu','elumichai','lime','lemon nimbu','nimbe hannu'] },
  { canonical:'Orange',           cat:'Fruits',       aliases:['orange','santra','naranga','mosumbi','sweet lime','nagpur orange'] },
  { canonical:'Apple',            cat:'Fruits',       aliases:['apple','seb','shimla apple','kashmiri apple','seve'] },
  { canonical:'Grapes',           cat:'Fruits',       aliases:['grapes','angoor','drakshai','black grapes','white grapes','green grapes','drakshi'] },
  { canonical:'Strawberry',       cat:'Fruits',       aliases:['strawberry','strawberries'] },
  { canonical:'Avocado',          cat:'Fruits',       aliases:['avocado','butter fruit','makhanphal'] },
  { canonical:'Dragon Fruit',     cat:'Fruits',       aliases:['dragon fruit','pitaya','dragon'] },
  { canonical:'Jackfruit',        cat:'Fruits',       aliases:['jackfruit','kathal','halasina hannu','chakka'] },
  { canonical:'Amla',             cat:'Fruits',       aliases:['amla','indian gooseberry','nellikai','gooseberry'] },
  { canonical:'Pear',             cat:'Fruits',       aliases:['pear','nashpati','babugosha'] },
  // Leafy Greens
  { canonical:'Spinach',          cat:'Leafy Greens', aliases:['spinach','palak','pasalai keerai','baby spinach','palak leaves'] },
  { canonical:'Methi Leaves',     cat:'Leafy Greens', aliases:['methi','fenugreek','methi leaves','vendhaya keerai','menthya soppu'] },
  { canonical:'Curry Leaves',     cat:'Leafy Greens', aliases:['curry leaves','kadi patta','karivepilai','karipatta','karibevu'] },
  { canonical:'Coriander Leaves', cat:'Leafy Greens', aliases:['coriander','dhania','kothamalli','cilantro','coriander leaves','kottambari soppu'] },
  { canonical:'Mint Leaves',      cat:'Leafy Greens', aliases:['mint','pudina','pudina leaves','mint leaves','pudina soppu'] },
  { canonical:'Amaranth Leaves',  cat:'Leafy Greens', aliases:['amaranth','rajgira','mulai keerai','chauli','thotakura','harive soppu'] },
  { canonical:'Drumstick Leaves', cat:'Leafy Greens', aliases:['drumstick leaves','moringa leaves','murungai keerai','nugge soppu'] },
  { canonical:'Lettuce',          cat:'Leafy Greens', aliases:['lettuce','iceberg','romaine','salad leaves'] },
  { canonical:'Dill Leaves',      cat:'Leafy Greens', aliases:['dill','soa','suva','dill leaves','sabbasige soppu'] },
  // Herbs
  { canonical:'Ginger',           cat:'Herbs',        aliases:['ginger','adrak','inji','fresh ginger','shunti'] },
  { canonical:'Garlic',           cat:'Herbs',        aliases:['garlic','lehsun','poondu','bellulli'] },
  { canonical:'Turmeric',         cat:'Herbs',        aliases:['turmeric','haldi','manjal','fresh turmeric','arishina'] },
  { canonical:'Green Chilli',     cat:'Herbs',        aliases:['green chilli','hari mirch','pachamilagai','green chili','hasi menasinkayi'] },
  { canonical:'Lemongrass',       cat:'Herbs',        aliases:['lemongrass','lemon grass'] },
]

// Build O(1) alias lookup
const ALIAS_MAP = new Map()
for (const entry of PRODUCE_DICT) {
  ALIAS_MAP.set(entry.canonical.toLowerCase(), entry)
  for (const alias of entry.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), entry)
  }
}

// Words to strip before matching
const NOISE = /\b(organic|fresh|farm|natural|desi|natti|country|hybrid|raw|ripe|baby|mini|local|certified|chemical[\s-]?free|pesticide[\s-]?free)\b/gi
const WEIGHT = /\b\d+\s*(g|gm|gms|gram|grams|kg|kgs|ml|l|litre|liter|pcs?|piece|pieces|bunch|bunches|nos?|pack|packet)\b/gi

function stripNoise(name) {
  return name.replace(NOISE, '').replace(WEIGHT, '').replace(/[()[\]]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// ── Pass 1: Fuse.js fuzzy match against existing DB master items ──────────────
function fuzzyMatch(rawProducts, masterItems) {
  const fuse = new Fuse(masterItems, {
    keys: ['canonical_name', 'aliases'],
    threshold: 0.6,
    includeScore: true,
  })

  const matched   = []
  const unmatched = []

  for (const product of rawProducts) {
    const results = fuse.search(product.name)
    if (results.length > 0 && results[0].score <= FUZZY_THRESHOLD) {
      matched.push({
        ...product,
        masterItemId: results[0].item.id,
        masterName:   results[0].item.canonical_name,
        matchScore:   results[0].score,
        matchMethod:  'fuzzy',
      })
    } else {
      unmatched.push(product)
    }
  }

  logger.info(`[Normalizer] Fuzzy matched ${matched.length}, unmatched ${unmatched.length}`)
  return { matched, unmatched }
}

// ── Pass 2: Local dictionary ──────────────────────────────────────────────────
function localNormalise(products) {
  return products.map(p => {
    const stripped = stripNoise(p.name)

    // Exact alias lookup
    if (ALIAS_MAP.has(stripped)) {
      const e = ALIAS_MAP.get(stripped)
      return { ...p, masterName: e.canonical, category: e.cat, isFreshProduce: true, matchMethod: 'local_dict' }
    }

    // Single-word match
    for (const word of stripped.split(/\s+/)) {
      if (word.length >= 3 && ALIAS_MAP.has(word)) {
        const e = ALIAS_MAP.get(word)
        return { ...p, masterName: e.canonical, category: e.cat, isFreshProduce: true, matchMethod: 'local_word' }
      }
    }

    // Partial substring match
    for (const [alias, entry] of ALIAS_MAP.entries()) {
      if (stripped.includes(alias) || alias.includes(stripped)) {
        return { ...p, masterName: entry.canonical, category: entry.cat, isFreshProduce: true, matchMethod: 'local_partial' }
      }
    }

    logger.debug(`[Normalizer] Unmapped: "${p.name}"`)
    return { ...p, masterName: p.name, category: 'Unknown', isFreshProduce: null, matchMethod: 'unmatched' }
  })
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function normalise(rawProducts, masterItems) {
  const valid = rawProducts.filter(p => p.name && p.price && p.price > 0)
  const { matched, unmatched } = fuzzyMatch(valid, masterItems)
  if (unmatched.length === 0) return matched
  const localResults = localNormalise(unmatched)
  return [...matched, ...localResults]
}

module.exports = { normalise, fuzzyMatch, localNormalise, PRODUCE_DICT }
