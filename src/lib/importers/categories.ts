/** Automatic suggestions only. Database manual mappings remain authoritative. */
type Rule = readonly [RegExp, string, string | null];
type Guess = { department: string | null; subcategory: string | null };

// Human category words only; never use this normalization for product identities.
const words = (value: string | null) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// A combined department heading is not evidence for either of its subcategories.
const COMBINED_DEPARTMENTS: Readonly<Record<string, string>> = {
  "phones & accessories": "phones",
  "computers & gaming": "computers-gaming",
  "kitchen & appliances": "kitchen",
  "home & living": "home",
  "sports & fitness": "sports",
  "groceries & household": "groceries",
  "shoes & bags": "shoes-bags",
  "jewelry & watches": "jewelry-watches",
};

// Resolve known product conflicts even when the merchant category is misleading.
const CONTEXT: readonly Rule[] = [
  [/\b(?:desk|table|floor|bedside) lamps?\b|skrivbordslampa|bordslampa|golvlampa/, "home", "lighting"],
  [/table runners?|bordsduk/, "home", "textiles"],
  [/camping.*\b(?:chairs?|tables?|beds?)\b|campingstol|campingbord/, "outdoors", "camping"],
  [/\b(?:outdoor|patio)\b.*\b(?:furniture|chairs?|tables?|sofas?)\b|utemobler/, "garden", null],
  [/\b(?:baby|nursery)\b.*\b(?:crib|cot|high ?chair)\b|spjalsang|barnmatstol/, "baby-kids", null],
  [/bed (?:linen|sheets?|covers?)|sangklader|\b(?:chair|sofa|couch) (?:covers?|cushions?)\b/, "home", "textiles"],
  [/\b(?:pets?|dogs?|cats?)\b.*\b(?:food|treats?|toys?|shampoo|beds?)\b|hundfoder|kattfoder|djurfoder/, "pets", null],
  [/\bgarden\b.*\b(?:tools?|furniture|chairs?|tables?)\b|tradgards|utemobler/, "garden", null],
  [/barnstrump|babystrump|barntights|barnleggings|barnstrumpbyxor|knastrumpor for barn|\b(?:kids?|children'?s?|baby)\s+(?:clothing|clothes|socks?|leggings|shoes)\b|barnklader/, "baby-kids", null],
  [/strump|sockor|socken|sokken|\bsocks?\b|hosiery|tights|kousen/, "fashion", null],
  [/beauty blender|face blender|blending sponge|make[ -]?up sponge|ecotools|\b(?:make[ -]?up|cosmetic)\b.*\b(?:brush|blender|sponge)\b/, "beauty", "makeup"],
  [/skin[ -]?care|moisturis|moisturiz|face cream|body cream|hudvard|ansiktskram|ansiktskrem|\bnivea\b/, "beauty", "skin-care"],
  [/\b(?:vitamins?|supplements?)\b|kosttillskott/, "health", null],
  [/dishwasher tablet|diskmaskinstablett/, "groceries", "cleaning"],
  [/motorcycle|motorbike|motorcykel/, "automotive", "motorcycles"],
  [/\btoy\s+(?:car|kitchen|phone|chair|table|bed|furniture)\b|dollhouse|dockhus|leksak|\blego\b/, "toys", null],
];

// Test specific leaf/product evidence before broad ancestor words such as home or food.
const SPECIFIC: readonly Rule[] = [
  [/\bsofas?\b|\bcouches?\b|armchair|\bsoffa\b|fatolj/, "furniture", "sofas"],
  [/\bchairs?\b|\bstolar?\b|kontorsstol|gamingstol/, "furniture", "chairs"],
  [/\btables?\b|\bdesks?\b|soffbord|matbord|skrivbord|sangbord/, "furniture", "tables"],
  [/\bbeds?\b|bed[ -]?frame|mattress|\bsang(?:ar)?\b|madrass/, "furniture", "beds"],
  [/wardrobe|bookcase|cabinet|chest of drawers|sideboard|garderob|bokhylla|\bbyra\b|\bskap\b|badrumsskap|vitrinskap/, "furniture", "storage"],
  [/make[ -]?up|cosmetic|foundation|concealer|mascara|lipstick|smink/, "beauty", "makeup"],
  [/fragrance|perfume|parfym|eau de (?:parfum|toilette)/, "beauty", "fragrances"],
  [/skin[ -]?care|hudvard|face cream|body cream|moisturis|moisturiz/, "beauty", "skin-care"],
  [/coffee beans|ground coffee|coffee pods|coffee capsules|\btea\b|kaffebonor|malet kaffe|kaffekapslar/, "groceries", "drinks"],
  [/head ?phone|earphone|ear ?bud|headset|horlurar/, "electronics", "headphones"],
  [/speaker|soundbar|hi-?fi|hogtalare/, "electronics", "speakers"],
  [/television|\btvs?\b|oled|qled/, "electronics", "tv"],
  [/smart home|smart plug|smart bulb|security camera|smarta hem/, "electronics", "smart-home"],
  [/phone case|screen protector|mobilskal|skarmskydd/, "phones", "cases"],
  [/charger|power bank|charging|usb cable|laddare|laddkabel|\b(?:usb|phone|travel) adapter\b/, "phones", "chargers"],
  [/phone accessories|mobile accessories|phone mount|phone stand|mobiltillbehor|mobilhallare/, "phones", "accessories"],
  [/mobile phone|smartphone|cell phone|mobiltelefon|\bphones?\b/, "phones", "smartphones"],
  [/laptop|notebook|chromebook|macbook|barbar dator/, "computers-gaming", "laptops"],
  [/\btablets?\b|ipad|surfplatta/, "computers-gaming", "tablets"],
  [/monitor|display screen|bildskarm/, "computers-gaming", "monitors"],
  [/gaming|console|controller|gamepad|keyboard|\bmouse\b|video game|tangentbord|spelkonsol/, "computers-gaming", "gaming"],
  [/espresso|coffee machine|coffee maker|kaffemaskin|kaffebryggare/, "kitchen", "coffee"],
  [/cookware|frying pan|saucepan|casserole|\bpots?\b|\bpans?\b|stekpanna|kastrull/, "kitchen", "cookware"],
  [/kettle|toaster|blender|air ?fryer|microwave|food processor|kitchen appliance|meat grinder|kottkvarn|mikrovagsugn|vattenkokare|brodrost/, "kitchen", "small-appliances"],
  [/kitchen accessories|kitchen utensils|cutlery|chopping board|kitchen knife|kokstillbehor|koksredskap|bestick|skarbrada/, "kitchen", "kitchen-accessories"],
  [/lighting|\blamps?\b|ceiling light|light bulb|belysning|lampor/, "home", "lighting"],
  [/bedding|duvet|towel|curtain|cushion|textile|\brugs?\b|sangklader|handduk|gardin|matta/, "home", "textiles"],
  [/\bstorage\b|organis|organiz|shelving|forvaring|hyllor/, "home", "storage"],
  [/\bdecor\b|decoration|\bvases?\b|wall art|candles?|inredning|vaser|ljuslykta/, "home", "decor"],
  [/sports?[ -]?watch|fitness tracker|gps watch|sportklocka|aktivitetsarmband/, "sports", "wearables"],
  [/running|lopning/, "sports", "running"],
  [/fitness|\bgym\b|weights|dumbbell|yoga|exercise|hantlar|traning/, "sports", "fitness"],
  [/sports accessories|sports equipment|football|soccer|fotboll|sporttillbehor|sportutrustning/, "sports", "sports-accessories"],
  [/camping|\btents?\b|sleeping bag|talt|sovsack/, "outdoors", "camping"],
  [/hiking|backpack|rucksack|trekking|vandring|ryggsack/, "outdoors", "hiking"],
  [/cycling|bicycle|\bbikes?\b|cykel/, "outdoors", "cycling"],
  [/cleaning|detergent|dishwasher tablet|laundry|stadning|tvattmedel|diskmedel/, "groceries", "cleaning"],
  [/motorcycle|motorbike|motorcykel/, "automotive", "motorcycles"],
  [/\bvehicles?\b|\bcars?\b|\bfordon\b|\bbilar?\b/, "automotive", "vehicles"],
  [/sunglasses|solglasogon/, "jewelry-watches", "sunglasses"],
  [/jewel|smycken|necklace|earrings/, "jewelry-watches", "jewellery"],
  [/\bwatch(?:es)?\b|armbandsur|klockor/, "jewelry-watches", "watches"],
  [/handbag|\bbags?\b|vaskor|handvaska/, "shoes-bags", "bags"],
  [/shoe|trainer|sneaker|\bboots?\b|\bskor\b|stovlar/, "shoes-bags", "shoes"],
  [/\bwomen'?s?\b|\bladies\b|damklader|damunderklader|\bdam\b/, "fashion", "womens"],
  [/\bmen'?s?\b|herrklader|\bherr\b/, "fashion", "mens"],
];

const GENERAL: readonly Rule[] = [
  [/furniture|mobler/, "furniture", null],
  [/\bpets?\b|\bdogs?\b|\bcats?\b|husdjur/, "pets", null],
  [/garden|lawn|\bplants?\b|tradgard/, "garden", null],
  [/\bbaby\b|nursery|\bkids?\b|children|barn/, "baby-kids", null],
  [/strump|sockor|socken|sokken|\bsocks?\b|hosiery|tights|kousen|underklader|underwear|trosa|trosor|boxer shorts|boxershorts|leggings|shapewear|hipster|korrigerande/, "fashion", null],
  [/clothing|apparel|fashion|dress|shirt|jacket|trousers|jeans|klader/, "fashion", null],
  [/beauty|skonhet/, "beauty", null],
  [/\btoys?\b|board game|puzzle|leksaker/, "toys", null],
  [/automotive|motoring|biltillbehor/, "automotive", null],
  [/\btools?\b|\bdiy\b|hardware|drill|verktyg/, "diy-tools", null],
  [/grocer|\bfood\b|pantry|snack|beverage|drink|livsmedel/, "groceries", "pantry"],
  [/\bbooks?\b|education|bocker/, "books", null],
  [/office|stationery|kontor/, "office", null],
  [/health|wellness|halsa/, "health", null],
  [/luggage|suitcase|travel|resvaska/, "travel", null],
  [/audio|electronic|camera|elektronik/, "electronics", null],
  [/computer|dator/, "computers-gaming", null],
  [/kitchen|\bkok\b/, "kitchen", null],
  [/\bsport/, "sports", null],
  [/outdoor|friluft/, "outdoors", null],
  [/\bhome\b|\bhem\b/, "home", null],
];

function match(rules: readonly Rule[], text: string): Guess | null {
  for (const [pattern, department, subcategory] of rules) if (pattern.test(text)) return { department, subcategory };
  return null;
}

export function guessDepartment(categoryPath: string | null, title: string | null, condition: string): Guess {
  const path = words(categoryPath), product = words(title), text = `${path} ${product}`;
  if (condition !== "new") {
    if (/\bphone|smartphone|mobiltelefon/.test(text)) return { department: "refurbished", subcategory: "refurb-phones" };
    if (/laptop|computer|notebook|dator/.test(text)) return { department: "refurbished", subcategory: "refurb-computers" };
    return { department: "refurbished", subcategory: null };
  }
  const context = match(CONTEXT, text);
  if (context) return context;
  const leaf = path.split(/\s*(?:>|\/|\|)\s*/).filter(Boolean).at(-1) ?? "";
  const combined = COMBINED_DEPARTMENTS[leaf.replace(/\band\b/g, "&")];
  if (combined) return match(SPECIFIC, product) ?? { department: combined, subcategory: null };
  for (const rules of [SPECIFIC, GENERAL]) {
    for (const source of [leaf, product, path]) {
      const result = match(rules, source);
      if (result) return result;
    }
  }
  return { department: null, subcategory: null };
}
