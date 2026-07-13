/**
 * scraper/normalizer/index.js
 * Local dictionary normaliser — no API key needed.
 * Pass 1: Fuse.js fuzzy match against master_items in DB
 * Pass 2: Curated produce dictionary with comprehensive aliases
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.scraper") });
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  override: false,
});

const Fuse = require("fuse.js");
const { logger } = require("../utils/index");

const FUZZY_THRESHOLD = 0.55;

// ── Produce dictionary ────────────────────────────────────────────────────────
const PRODUCE_DICT = [
  // ── Vegetables ──────────────────────────────────────────────────────────────
  {
    canonical: "Tomato",
    cat: "Vegetables",
    aliases: [
      "tomato",
      "tamatar",
      "natti tomato",
      "country tomato",
      "desi tomato",
      "tomato country",
      "tomato farm",
      "tomato local",
      "cherry tomato",
      "green tomato",
      "thakkali",
    ],
  },
  {
    canonical: "Onion",
    cat: "Vegetables",
    aliases: [
      "onion",
      "pyaz",
      "red onion",
      "white onion",
      "sambar onion",
      "shallot",
      "small onion",
      "cheriya ulli",
      "chinna vengayam",
      "vengayam",
      "eerulli",
      "kunjulli",
    ],
  },
  {
    canonical: "Potato",
    cat: "Vegetables",
    aliases: [
      "potato",
      "aloo",
      "batata",
      "baby potato",
      "potato local",
      "potato sweet",
      "red potato",
      "urulaikizhangu",
      "aalugadde",
    ],
  },
  {
    canonical: "Sweet Potato",
    cat: "Vegetables",
    aliases: [
      "sweet potato",
      "shakarkandi",
      "sakaravalli",
      "genasina gadde",
      "potato - sweet",
      "orange sweet potato",
      "purple sweet potato",
    ],
  },
  {
    canonical: "Carrot",
    cat: "Vegetables",
    aliases: ["carrot", "gajar", "gajjar", "carotte"],
  },
  {
    canonical: "Brinjal",
    cat: "Vegetables",
    aliases: [
      "brinjal",
      "eggplant",
      "baingan",
      "kathirikai",
      "badanekayi",
      "aubergine",
      "bottle brinjal",
      "purple brinjal",
      "gulla brinjal",
      "brinjal purple",
      "brinjal long",
      "brinjal green",
      "brinjal round",
    ],
  },
  {
    canonical: "Capsicum Green",
    cat: "Vegetables",
    aliases: [
      "capsicum",
      "green capsicum",
      "bell pepper",
      "shimla mirch",
      "kodamilagai",
      "donne menasinkayi",
      "capsicum green",
    ],
  },
  {
    canonical: "Capsicum Red",
    cat: "Vegetables",
    aliases: [
      "red capsicum",
      "red bell pepper",
      "lal shimla mirch",
      "capsicum red",
    ],
  },
  {
    canonical: "Capsicum Yellow",
    cat: "Vegetables",
    aliases: [
      "yellow capsicum",
      "yellow bell pepper",
      "pili shimla mirch",
      "capsicum yellow",
    ],
  },
  {
    canonical: "Beans",
    cat: "Vegetables",
    aliases: [
      "beans",
      "french beans",
      "green beans",
      "string beans",
      "snap beans",
      "barbati",
      "sem phali",
      "sem",
    ],
  },
  {
    canonical: "Cluster Beans",
    cat: "Vegetables",
    aliases: [
      "cluster beans",
      "gavar",
      "kothavarangai",
      "gawar phali",
      "gorikai",
      "beans - cluster",
      "beans cluster",
    ],
  },
  {
    canonical: "Flat Beans",
    cat: "Vegetables",
    aliases: [
      "flat beans",
      "valor",
      "valor beans",
      "valor papdi",
      "papdi",
      "beans - flat",
      "beans flat",
    ],
  },
  {
    canonical: "Dark Green Beans",
    cat: "Vegetables",
    aliases: [
      "dark green beans",
      "beans - dark green small",
      "beans dark green",
      "dark green small beans",
      "french beans small",
    ],
  },
  {
    canonical: "Long Beans",
    cat: "Vegetables",
    aliases: ["long beans", "runner beans", "yard long beans", "barbati beans"],
  },
  {
    canonical: "Double Beans",
    cat: "Vegetables",
    aliases: [
      "double beans",
      "butter beans",
      "hyacinth bean",
      "field beans",
      "avarekalu",
    ],
  },
  {
    canonical: "Broad Beans",
    cat: "Vegetables",
    aliases: ["broad beans", "fava beans", "bakla"],
  },
  {
    canonical: "Cranberry Beans",
    cat: "Vegetables",
    aliases: ["cranberry beans", "borlotti beans", "cranberry beans shelled"],
  },
  {
    canonical: "Cowpeas",
    cat: "Vegetables",
    aliases: ["cowpeas", "lobia", "chavli", "black eyed peas", "cowpea"],
  },
  {
    canonical: "Moth Beans",
    cat: "Vegetables",
    aliases: ["moth beans", "matki", "madaki kalu", "moth bean"],
  },
  {
    canonical: "Winged Beans",
    cat: "Vegetables",
    aliases: ["winged beans", "goa beans", "four angled bean"],
  },
  {
    canonical: "Cucumber",
    cat: "Vegetables",
    aliases: [
      "cucumber",
      "kakdi",
      "vellarikai",
      "kheera",
      "southekayi",
      "english cucumber",
      "yellow cucumber",
      "cucumber english",
    ],
  },
  {
    canonical: "Bitter Gourd",
    cat: "Vegetables",
    aliases: [
      "bitter gourd",
      "karela",
      "pavakkai",
      "hagalakayi",
      "gourd - bitter",
      "bittergourd",
      "bitter melon",
      "organic bittergourd"
    ],
  },
  {
    canonical: "Bottle Gourd",
    cat: "Vegetables",
    aliases: [
      "bottle gourd",
      "lauki",
      "sorakkai",
      "sorekayi",
      "dudhi",
      "ghiya",
      "gourd - bottle",
      "round bottle gourd",
      "natti bottle gourd",
    ],
  },
  {
    canonical: "Ridge Gourd",
    cat: "Vegetables",
    aliases: [
      "ridge gourd",
      "turai",
      "peerkangai",
      "heerekayi",
      "gourd - ridge",
    ],
  },
  {
    canonical: "Snake Gourd",
    cat: "Vegetables",
    aliases: [
      "snake gourd",
      "pudalangai",
      "padavalanga",
      "padwal",
      "gourd - snake",
      "snakegourd",
    ],
  },
  {
    canonical: "Pumpkin",
    cat: "Vegetables",
    aliases: ["pumpkin", "kaddu", "poosanikai", "kumbalakayi"],
  },
  {
    canonical: "Red Pumpkin",
    cat: "Vegetables",
    aliases: ["red pumpkin", "pumpkin red", "pumpkin - red", "lal kaddu"],
  },
  {
    canonical: "White Pumpkin",
    cat: "Vegetables",
    aliases: [
      "white pumpkin",
      "ash gourd",
      "pumpkin white",
      "pumpkin - white",
      "boodida gummadi",
    ],
  },
  {
    canonical: "Lady Finger",
    cat: "Vegetables",
    aliases: [
      "ladies finger",
      "lady finger",
      "okra",
      "bhindi",
      "vendakkai",
      "bendekayi",
    ],
  },
  {
    canonical: "Cauliflower",
    cat: "Vegetables",
    aliases: ["cauliflower", "phool gobhi", "hookosu"],
  },
  {
    canonical: "Cabbage",
    cat: "Vegetables",
    aliases: [
      "cabbage",
      "bandh gobhi",
      "muttaikose",
      "ele kosu",
      "red cabbage",
      "purple cabbage",
    ],
  },
  {
    canonical: "Broccoli",
    cat: "Vegetables",
    aliases: ["broccoli", "hari gobhi"],
  },
  {
    canonical: "Beetroot",
    cat: "Vegetables",
    aliases: ["beetroot", "beet", "chukandar"],
  },
  {
    canonical: "Radish",
    cat: "Vegetables",
    aliases: [
      "radish",
      "mooli",
      "mullangi",
      "moolangi",
      "white radish",
      "radish loose",
      "radish bunches",
      "red radish",
      "red raddish",
    ],
  },
  {
    canonical: "Yam",
    cat: "Vegetables",
    aliases: [
      "yam",
      "kanda",
      "senaikizhangu",
      "elephant yam",
      "suran",
      "suvarna gedde",
      "yam slice",
      "yam whole",
    ],
  },
  {
    canonical: "Colocasia",
    cat: "Vegetables",
    aliases: [
      "colocasia",
      "arbi",
      "taro",
      "seppankizhangu",
      "kesavina gedde",
      "arvi",
    ],
  },
  {
    canonical: "Drumstick",
    cat: "Vegetables",
    aliases: [
      "drumstick",
      "moringa",
      "murungakkai",
      "sahajan",
      "nuggekayi",
      "drum stick",
    ],
  },
  {
    canonical: "Raw Banana",
    cat: "Vegetables",
    aliases: ["raw banana", "green banana", "vazhakai", "bale kayi"],
  },
  {
    canonical: "Banana Stem",
    cat: "Vegetables",
    aliases: ["banana stem", "banana trunk", "vazhai thandu", "kele ka tana"],
  },
  {
    canonical: "Banana Flower",
    cat: "Vegetables",
    aliases: ["banana flower", "banana blossom", "mocha", "vazhai poo"],
  },
  {
    canonical: "Raw Jackfruit",
    cat: "Vegetables",
    aliases: [
      "raw jackfruit",
      "kathal",
      "palakkai",
      "baby jackfruit",
      "tender jackfruit",
    ],
  },
  {
    canonical: "Green Peas",
    cat: "Vegetables",
    aliases: ["green peas", "matar", "pattani", "peas", "batani", "peas green"],
  },
  {
    canonical: "Corn",
    cat: "Vegetables",
    aliases: [
      "corn",
      "maize",
      "sweet corn",
      "makka",
      "bhutta",
      "mekkejola",
      "baby corn",
      "corn sweet",
    ],
  },
  {
    canonical: "Knol Khol",
    cat: "Vegetables",
    aliases: [
      "knol khol",
      "kohlrabi",
      "noolkhol",
      "navilu kosu",
      "ganth gobhi",
    ],
  },
  {
    canonical: "Chow Chow",
    cat: "Vegetables",
    aliases: [
      "chow chow",
      "chayote",
      "seemebadnekai",
      "seeme badanekai",
      "ishkush",
      "bangalore brinjal",
      "chow chow seemebadnekai",
      "squash chyote",
    ],
  },
  {
    canonical: "Cocinia",
    cat: "Vegetables",
    aliases: [
      "cocinia",
      "coccinia",
      "tonde",
      "tondekai",
      "kunduru",
      "kundru",
      "ivy gourd",
      "tendli",
      "tindora",
      "kovakkai",
      "little gourd",
    ],
  },
  {
    canonical: "Cherry Tomato",
    cat: "Vegetables",
    aliases: [
      "cherry tomato",
      "cherry tomatoes",
      "cherry tomato oval",
      "cherry tomato yellow",
    ],
  },
  {
    canonical: "Mushroom",
    cat: "Vegetables",
    aliases: [
      "mushroom",
      "button mushroom",
      "oyster mushroom",
      "milky mushroom",
      "pink oyster mushroom",
    ],
  },
  {
    canonical: "Zucchini",
    cat: "Vegetables",
    aliases: ["zucchini", "zucchini green", "yellow zucchini", "courgette", "zucchini yellow", "zuchhini"],
  },
  {
    canonical: "Cluster Beans",
    cat: "Vegetables",
    aliases: [
      "cluster beans",
      "gavar",
      "kothavarangai",
      "gawar phali",
      "gorikai",
    ],
  },
  {
    canonical: "Turkey Berry",
    cat: "Vegetables",
    aliases: ["turkey berry", "sundakkai"],
  },
  {
    canonical: "Togari Kayi",
    cat: "Vegetables",
    aliases: ["togari kayi", "green toordal", "togarikaayi"],
  },
  {
    canonical: "Sambar Onion",
    cat: "Vegetables",
    aliases: ["sambar onion", "shallots", "cheriya ulli", "chinna vengayam"],
  },
  {
    canonical: "Groundnut",
    cat: "Vegetables",
    aliases: [
      "groundnut",
      "peanut",
      "moongphali",
      "kadlekai",
      "fresh groundnut",
    ],
  },
  {
    canonical: "Raw Papaya",
    cat: "Vegetables",
    aliases: ["raw papaya", "green papaya", "kacha papita"],
  },
  {
    canonical: "Bajji Chilli",
    cat: "Vegetables",
    aliases: ["bajji chilli", "bajji mirchi", "banana pepper", "bhajji chilli"],
  },
  {
    canonical: "Tapioca",
    cat: "Vegetables",
    aliases: ["tapioca", "maragenasu", "kappa", "cassava"],
  },

  // ── Fruits ──────────────────────────────────────────────────────────────────
  {
    canonical: "Banana",
    cat: "Fruits",
    aliases: [
      "banana",
      "kela",
      "vazhai",
      "robusta banana",
      "elakki banana",
      "poovan",
      "bale hannu",
      "nenthra",
    ],
  },
  {
    canonical: "Nendran Banana",
    cat: "Fruits",
    aliases: ["nendran", "nendran banana", "nendran pazham", "kerala banana"],
  },
  {
    canonical: "Papaya",
    cat: "Fruits",
    aliases: ["papaya", "papita", "pappali", "ripe papaya", "parangi hannu"],
  },
  {
    canonical: "Mango",
    cat: "Fruits",
    aliases: [
      "mango",
      "aam",
      "manga",
      "totapuri",
      "alphonso",
      "banginapalli",
      "raspuri",
      "badami",
      "malgova",
      "mavinahannu",
    ],
  },
  {
    canonical: "Guava",
    cat: "Fruits",
    aliases: ["guava", "amrood", "peru", "koyya", "seebe hannu"],
  },
  {
    canonical: "Pomegranate",
    cat: "Fruits",
    aliases: ["pomegranate", "anar", "mathalam", "dalimba", "dalimbe"],
  },
  {
    canonical: "Sapota",
    cat: "Fruits",
    aliases: ["sapota", "chikoo", "chiku", "chickoo", "chikku", "sapote"],
  },
  {
    canonical: "Watermelon",
    cat: "Fruits",
    aliases: ["watermelon", "tarbooz", "tharpoosani", "kallangadi"],
  },
  {
    canonical: "Muskmelon",
    cat: "Fruits",
    aliases: ["muskmelon", "kharbuja", "cantaloupe"],
  },
  {
    canonical: "Pineapple",
    cat: "Fruits",
    aliases: ["pineapple", "ananas", "annanasi"],
  },
  {
    canonical: "Coconut",
    cat: "Fruits",
    aliases: [
      "coconut",
      "nariyal",
      "thengai",
      "tender coconut",
      "kobbari",
      "dry coconut",
      "kopra",
    ],
  },
  {
    canonical: "Lemon",
    cat: "Fruits",
    aliases: [
      "lemon",
      "nimbu",
      "elumichai",
      "lime",
      "nimbe hannu",
      "lemon greenish",
      "assam lemon",
      "kaji nemu",
    ],
  },
  {
    canonical: "Orange",
    cat: "Fruits",
    aliases: [
      "orange",
      "santra",
      "naranga",
      "mosumbi",
      "sweet lime",
      "nagpur orange",
    ],
  },
  {
    canonical: "Apple",
    cat: "Fruits",
    aliases: ["apple", "seb", "shimla apple", "kashmiri apple", "seve"],
  },
  {
    canonical: "Grapes",
    cat: "Fruits",
    aliases: [
      "grapes",
      "angoor",
      "drakshai",
      "black grapes",
      "white grapes",
      "green grapes",
      "drakshi",
    ],
  },
  {
    canonical: "Strawberry",
    cat: "Fruits",
    aliases: ["strawberry", "strawberries"],
  },
  {
    canonical: "Avocado",
    cat: "Fruits",
    aliases: ["avocado", "butter fruit", "makhanphal"],
  },
  {
    canonical: "Dragon Fruit",
    cat: "Fruits",
    aliases: ["dragon fruit", "pitaya"],
  },
  {
    canonical: "Jackfruit",
    cat: "Fruits",
    aliases: ["jackfruit", "kathal", "halasina hannu", "chakka"],
  },
  {
    canonical: "Amla",
    cat: "Fruits",
    aliases: [
      "amla",
      "indian gooseberry",
      "nellikai",
      "gooseberry",
      "nellikkai",
    ],
  },
  {
    canonical: "Pear",
    cat: "Fruits",
    aliases: ["pear", "nashpati", "babugosha"],
  },
  { canonical: "Plum", cat: "Fruits", aliases: ["plum", "aloo bukhara"] },
  {
    canonical: "Tamarind",
    cat: "Fruits",
    aliases: ["tamarind", "imli", "puli"],
  },
  {
    canonical: "Kiwi",
    cat: "Fruits",
    aliases: ["kiwi", "kiwi fruit", "kiwifruit"],
  },
  {
    canonical: "Blueberry",
    cat: "Fruits",
    aliases: ["blueberry", "blueberries"],
  },
  {
    canonical: "Pomelo",
    cat: "Fruits",
    aliases: ["pomelo", "pummelo", "chakotha"],
  },
  {
    canonical: "Cherry",
    cat: "Fruits",
    aliases: ["cherry", "cherries"],
  },
  {
    canonical: "Apricot",
    cat: "Fruits",
    aliases: ["apricot", "apricots"],
  },
  {
    canonical: "Nectarine",
    cat: "Fruits",
    aliases: ["nectarine", "nectarin"],
  },
  {
    canonical: "Peach",
    cat: "Fruits",
    aliases: ["peach", "peaches"],
  },
  {
    canonical: "Lychee",
    cat: "Fruits",
    aliases: ["lychee", "litchi"],
  },
  {
    canonical: "Raspberry",
    cat: "Fruits",
    aliases: ["raspberry", "raspberries"],
  },
  {
    canonical: "Mulberry",
    cat: "Fruits",
    aliases: ["mulberry", "mulberries"],
  },
  {
    canonical: "Jamun",
    cat: "Fruits",
    aliases: ["jamun", "nerale hannu", "kala jamun", "black plum"],
  },
  {
    canonical: "Golden Berry",
    cat: "Fruits",
    aliases: ["golden berry", "golden berries", "cape gooseberry"],
  },
  {
    canonical: "Fig",
    cat: "Fruits",
    aliases: ["fig", "figs", "diana yellow fig", "turkey brown fig"],
  },

  // ── Leafy Greens ─────────────────────────────────────────────────────────────
  {
    canonical: "Spinach",
    cat: "Leafy Greens",
    aliases: ["spinach", "palak", "pasalai keerai", "baby spinach"],
  },
  {
    canonical: "Methi Leaves",
    cat: "Leafy Greens",
    aliases: [
      "methi",
      "fenugreek",
      "methi leaves",
      "vendhaya keerai",
      "menthya soppu",
    ],
  },
  {
    canonical: "Curry Leaves",
    cat: "Leafy Greens",
    aliases: ["curry leaves", "kadi patta", "karivepilai", "karibevu"],
  },
  {
    canonical: "Coriander Leaves",
    cat: "Leafy Greens",
    aliases: [
      "coriander",
      "dhania",
      "kothamalli",
      "cilantro",
      "kottambari soppu",
    ],
  },
  {
    canonical: "Mint Leaves",
    cat: "Leafy Greens",
    aliases: ["mint", "pudina", "pudina leaves"],
  },
  {
    canonical: "Amaranth Leaves",
    cat: "Leafy Greens",
    aliases: [
      "amaranth",
      "rajgira",
      "mulai keerai",
      "harive soppu",
      "thotakura",
    ],
  },
  {
    canonical: "Drumstick Leaves",
    cat: "Leafy Greens",
    aliases: [
      "drumstick leaves",
      "moringa leaves",
      "murungai keerai",
      "nugge soppu",
    ],
  },
  {
    canonical: "Lettuce",
    cat: "Leafy Greens",
    aliases: ["lettuce", "iceberg", "romaine", "salad leaves"],
  },
  {
    canonical: "Gongura Leaves",
    cat: "Leafy Greens",
    aliases: ["gongura", "sorrel leaves", "pulicha keerai", "ambadi", "gongura leaves"],
  },
  {
    canonical: "Dill Leaves",
    cat: "Leafy Greens",
    aliases: ["dill", "soa", "suva", "dill leaves", "sabbasige soppu"],
  },
  {
    canonical: "Malabar Spinach",
    cat: "Leafy Greens",
    aliases: ["malabar spinach", "basale", "balli basale", "basale soppu"],
  },
  {
    canonical: "Celery",
    cat: "Leafy Greens",
    aliases: ["celery", "celery leaves", "celery sticks"],
  },
  {
    canonical: "Bok Choy",
    cat: "Leafy Greens",
    aliases: ["bok choy", "pak choi", "baby bok choy"],
  },
  {
    canonical: "Arugula",
    cat: "Leafy Greens",
    aliases: ["arugula", "rocket leaves", "rocket"],
  },
  {
    canonical: "Agathi Leaves",
    cat: "Leafy Greens",
    aliases: ["agathi", "agase soppu", "agathi keerai", "agathi leaves"],
  },
  {
    canonical: "Ajwain Leaves",
    cat: "Leafy Greens",
    aliases: ["ajwain leaves", "dodda pathra", "doddapatra"],
  },
  {
    canonical: "Chakotha Leaves",
    cat: "Leafy Greens",
    aliases: ["chakotha leaves", "chakotha soppu", "bathua"],
  },
  {
    canonical: "Kale",
    cat: "Leafy Greens",
    aliases: ["kale", "curly kale"],
  },
  {
    canonical: "Mustard Greens",
    cat: "Leafy Greens",
    aliases: ["mustard greens", "rai saag", "sarson ka saag"],
  },
  {
    canonical: "Purslane",
    cat: "Leafy Greens",
    aliases: ["purslane", "gonni soppu", "kulfa"],
  },
  {
    canonical: "Wheatgrass",
    cat: "Leafy Greens",
    aliases: ["wheatgrass", "wheat grass"],
  },
  {
    canonical: "Microgreens",
    cat: "Leafy Greens",
    aliases: ["microgreens", "micro greens", "microgreen", "pink raddish", "white raddish", "mustard micro greens", "sunflower shoots"],
  },
  {
    canonical: "Sprouts",
    cat: "Leafy Greens",
    aliases: ["sprouts", "sprout", "mixed sprouts"],
  },

  // ── Herbs ────────────────────────────────────────────────────────────────────
  {
    canonical: "Ginger",
    cat: "Herbs",
    aliases: [
      "ginger",
      "adrak",
      "inji",
      "shunti",
      "ginger mizo",
      "fresh ginger",
    ],
  },
  {
    canonical: "Garlic",
    cat: "Herbs",
    aliases: [
      "garlic",
      "lehsun",
      "poondu",
      "bellulli",
      "hill garlic",
      "smoked garlic",
    ],
  },
  {
    canonical: "Turmeric",
    cat: "Herbs",
    aliases: [
      "turmeric",
      "haldi",
      "manjal",
      "fresh turmeric",
      "arishina",
      "black turmeric",
      "kali haldi",
    ],
  },
  {
    canonical: "Green Chilli",
    cat: "Herbs",
    aliases: [
      "green chilli",
      "hari mirch",
      "pachamilagai",
      "green chili",
      "hasi menasinkayi",
      "green chillies",
      "birds eye chili",
      "bird eye chili",
    ],
  },
  {
    canonical: "Basil",
    cat: "Herbs",
    aliases: ["basil", "italian basil", "sweet basil", "tulsi"],
  },
];

// Build O(1) alias lookup map
const ALIAS_MAP = new Map();
for (const entry of PRODUCE_DICT) {
  ALIAS_MAP.set(entry.canonical.toLowerCase(), entry);
  for (const alias of entry.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), entry);
  }
}

// Words to strip before matching
const NOISE =
  /\b(organic|fresh|farm|natural|desi|natti|country|hybrid|raw|ripe|baby|mini|local|certified|chemical[\s-]?free|pesticide[\s-]?free|satva|satv)\b/gi;
const WEIGHT =
  /\b\d+[\d.-]*\s*(g|gm|gms|gram|grams|kg|kgs|ml|l|litre|liter|pcs?|piece|pieces|bunch|bunches|nos?|pack|packet|box|zip\s*lock)\b/gi;

function stripNoise(name) {
  return name
    .replace(NOISE, "")
    .replace(WEIGHT, "")
    .replace(/[()[\]~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── Pass 1: Fuse.js fuzzy match against existing DB master items ──────────────
function fuzzyMatch(rawProducts, masterItems) {
  const fuse = new Fuse(masterItems, {
    keys: ["canonical_name", "aliases"],
    threshold: 0.6,
    includeScore: true,
  });

  const matched = [];
  const unmatched = [];

  for (const product of rawProducts) {
    const results = fuse.search(product.name);
    if (results.length > 0 && results[0].score <= FUZZY_THRESHOLD) {
      matched.push({
        ...product,
        masterItemId: results[0].item.id,
        masterName: results[0].item.canonical_name,
        matchScore: results[0].score,
        matchMethod: "fuzzy",
      });
    } else {
      unmatched.push(product);
    }
  }

  logger.info(
    `[Normalizer] Fuzzy matched ${matched.length}, unmatched ${unmatched.length}`,
  );
  return { matched, unmatched };
}

// ── Pass 1: Local dictionary lookup (precise curated aliases) ────────────────
// Returns { matched, unmatched } so unmatched items fall through to fuzzy match.
function localDictMatch(products) {
  const matched = [];
  const unmatched = [];

  for (const p of products) {
    const stripped = stripNoise(p.name);
    let entry = null;
    let method = null;

    // 1. Exact alias lookup on stripped name
    if (ALIAS_MAP.has(stripped)) {
      entry = ALIAS_MAP.get(stripped);
      method = "local_exact";
    }

    // 2. Single-word scan (longest word first for best match)
    if (!entry) {
      const words = stripped
        .split(/[\s\-\/]+/)
        .filter((w) => w.length >= 3)
        .sort((a, b) => b.length - a.length);
      for (const word of words) {
        if (ALIAS_MAP.has(word)) {
          entry = ALIAS_MAP.get(word);
          method = "local_word:" + word;
          break;
        }
      }
    }

    // 3. Partial substring scan
    if (!entry) {
      for (const [alias, e] of ALIAS_MAP.entries()) {
        if (
          stripped.includes(alias) ||
          (alias.length >= 4 && alias.includes(stripped))
        ) {
          entry = e;
          method = "local_partial";
          break;
        }
      }
    }

    if (entry) {
      matched.push({
        ...p,
        masterName: entry.canonical,
        category: entry.cat,
        isFreshProduce: true,
        matchMethod: method,
      });
    } else {
      unmatched.push(p);
    }
  }

  logger.info(
    `[Normalizer] Dict matched ${matched.length}, unmatched ${unmatched.length}`,
  );
  return { matched, unmatched };
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function normalise(rawProducts, masterItems) {
  const valid = rawProducts.filter((p) => p.name && p.price && p.price > 0);

  // Pre-clean raw names of leading asterisks, bullet points, hyphens, dots, and extra space
  const cleaned = valid.map((p) => {
    let name = String(p.name).trim();
    name = name.replace(/^[\*\-\•\s\.\u2022]+/g, "").trim();
    return {
      ...p,
      name,
    };
  });

  // Pass 1: Local dictionary first — curated aliases are more precise
  const { matched: dictMatched, unmatched: dictUnmatched } =
    localDictMatch(cleaned);

  // Pass 2: Fuse.js fuzzy match against DB master_items for leftovers
  const { matched: fuzzyMatched, unmatched: fuzzyUnmatched } = fuzzyMatch(
    dictUnmatched,
    masterItems,
  );

  // Pass 3: Remaining unmatched — keep with raw name, mark as Unknown
  const fallback = fuzzyUnmatched.map((p) => {
    logger.debug(
      `[Normalizer] Unmapped: "${p.name}" (stripped: "${stripNoise(p.name)}")`,
    );
    return {
      ...p,
      masterName: p.name,
      category: "Unknown",
      isFreshProduce: true,
      matchMethod: "unmatched",
    };
  });

  return [...dictMatched, ...fuzzyMatched, ...fallback];
}

module.exports = { normalise, fuzzyMatch, localDictMatch, PRODUCE_DICT };
