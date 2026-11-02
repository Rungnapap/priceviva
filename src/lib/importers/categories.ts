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
  // Pet products named like toys ("Husdjurstillbehör > Leksak" is a dog toy).
  [/husdjur|hundleksak|kattleksak|hundskal|hundhalsband|katthalsband/, "pets", null],
  // Children's socks that shops file under "Men's Socks": "Halkfria bomullsstrumpor för barn".
  [/(?:strump|sock|tights|leggings)\w*.*\bfor barn\b|flickstrump|pojkstrump/, "baby-kids", null],
  [/\b(?:desk|table|floor|bedside) lamps?\b|skrivbordslampa|bordslampa|golvlampa/, "home", "lighting"],
  [/table runners?|bordsduk/, "home", "textiles"],
  [/camping.*\b(?:chairs?|tables?|beds?)\b|campingstol|campingbord/, "outdoors", "camping"],
  [/\b(?:outdoor|patio)\b.*\b(?:furniture|chairs?|tables?|sofas?)\b|utemobler/, "garden", null],
  [/\b(?:baby|nursery)\b.*\b(?:crib|cot|high ?chair)\b|spjalsang|barnmatstol/, "baby-kids", null],
  [/bed (?:linen|sheets?|covers?)|sangklader|\b(?:chair|sofa|couch) (?:covers?|cushions?)\b/, "home", "textiles"],
  [/\b(?:pets?|dogs?|cats?)\b.*\b(?:food|treats?|toys?|shampoo|beds?)\b|hundfoder|kattfoder|djurfoder/, "pets", null],
  // "tradgards(?!redskap)": Bazta's shared "Verktyg & trädgårdsredskap" section also holds hand tools.
  // Not for toys: "Leksaker > Trädgårdsleksaker" (soap bubbles, sand sets) stay in Toys.
  [/^(?!.*leksak).*(?:\bgarden\b.*\b(?:tools?|furniture|chairs?|tables?)\b|tradgards(?!redskap)|utemobler)/, "garden", null],
  [/barnstrump|babystrump|barntights|barnleggings|barnstrumpbyxor|knastrumpor for barn|\b(?:kids?|children'?s?|baby)\s+(?:clothing|clothes|socks?|leggings|shoes)\b|barnklader/, "baby-kids", null],
  [/strump|sockor|socken|sokken|\bsocks?\b|hosiery|tights|kousen/, "fashion", null],
  [/beauty blender|face blender|blending sponge|make[ -]?up sponge|ecotools|\b(?:make[ -]?up|cosmetic)\b.*\b(?:brush|blender|sponge)\b/, "beauty", "makeup"],
  [/skin[ -]?care|moisturis|moisturiz|face cream|body cream|hudvard|ansiktskram|ansiktskrem|\bnivea\b/, "beauty", "skin-care"],
  [/\b(?:vitamins?|supplements?)\b|kosttillskott/, "health", null],
  [/dishwasher tablet|diskmaskinstablett/, "groceries", "cleaning"],
  // Not for toys: Playmobil "Polismotorcykel" in "Leksaker" is a toy.
  [/^(?!.*leksak).*(?:motorcycle|motorbike|motorcykel)/, "automotive", "motorcycles"],
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

// -----------------------------------------------------------------------------------------------------------------
// Merchant category input. Feeds describe categories differently (checked against the live Awin feeds, Nov 2026):
//   - Bazta: a full Swedish path ("Man > Kvinna > Personlig vård > Parfymer & dofter > Eau de parfum > SUMMER DEALS")
//   - Strumpor-online: Awin's own English category ("Men's Socks"); its shop category is often a campaign
//   - Deluxehomeartshop: only a product type ("LED Blockljus")
// The importer uses the most reliable field that is filled in.
// -----------------------------------------------------------------------------------------------------------------
export interface CategoryInput {
  /** merchant_product_category_path */
  path?: string | null;
  /** category_name: Awin's standard (English) category */
  categoryName?: string | null;
  /** product_type (or Fashion:category) */
  productType?: string | null;
  /** merchant_category */
  merchantCategory?: string | null;
  /** google_product_category */
  googleCategory?: string | null;
  title?: string | null;
}

/** The most reliable category text in a feed row: full path, then Awin's category, then product type, then the rest. */
export function categoryText(input: CategoryInput): string | null {
  for (const v of [input.path, input.categoryName, input.productType, input.merchantCategory, input.googleCategory]) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

/** A whole word, with å/ä/ö (and every other letter or digit) counted as part of a word. */
const W = (pattern: string) => `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`;
/** Word stems that may sit inside Swedish compounds ("Herrstrumpor", "Barntights"). */
const stems = (pattern: string) => new RegExp(pattern, "iu");

// Adult products are not imported (owner decision, Nov 2026): a general shopping site, SafeSearch and affiliate rules.
const ADULT_CATEGORY = stems("vuxen ?leksak|sexleksak|erotik|glidmedel|kondom|adult toys?|sex toys?|lubricant|condoms?");
const ADULT_TITLE = new RegExp(W("vibrator(er|ägg)?|dildos?|kondom(er)?|condoms?|glidmedel|lubricant|penisring|cockring|analplugg?|butt ?plugs?|sexleksak(er)?|bdsm|bondage|bäckenbottenkulor|love ?eggs?"), "iu");

/** True for adult/erotic products. These rows are skipped by the importer. */
export function isAdultProduct(input: CategoryInput): boolean {
  const segs = (input.path ?? "").split(">").map((s) => s.trim());
  // "Personlig vård > Intim > …" is the adult section; "Rakning & hårborttagning > Intim" (bikini trimmers) is not.
  const intim = segs.some((s, i) => /^intim$/i.test(s) && !/rakning|hårborttagning/i.test(segs[i - 1] ?? ""));
  const cats = [input.path, input.categoryName, input.productType, input.merchantCategory, input.googleCategory].filter(Boolean).join(" > ");
  return intim || ADULT_CATEGORY.test(cats) || ADULT_TITLE.test(input.title ?? "");
}

// Swedish merchant paths. The department comes from the first rule that matches anywhere in the cleaned path, so the
// order is the priority: "Husdjurstillbehör > Leksak" is Pets (not Toys), "Barn > … > Leksaker" is Toys.
// These run on the original text (with å/ä/ö); they never look at the product name.
const LIGHTING = `belysning|ljus|lampa|lampor|harlequin|${W("led")}`;
const SV_DEPARTMENTS: Rule[] = [
  [stems("husdjur|hundleksak|kattleksak|hundbädd|kattsand"), "pets", null],
  [stems("auto & cykel|biltillbehör|bilvård|cykel"), "automotive", null],
  // Watches before phones: Bazta files watches under "Klockor & Smartwatches". "Dörrklockor" are doorbells.
  [stems("(?<!dörr)klockor|(?<!dörr)klocka|armbandsur|smycke|halsband|örhängen|solglasögon"), "jewelry-watches", null],
  [stems("spelkonsol|playstation|nintendo|xbox|datortillbehör|dator|(?<!mobil & )surfplatta"), "computers-gaming", null],
  [stems("mobil|smartwatch|laddning|uppladdning"), "phones", null],
  [stems(`elektronik|kablar|hörlurar|högtalare|batteri|hem säkerhet|dörrklock|rökalarm|${W("tv")}`), "electronics", null],
  [stems("leksak|aktivitet & lek|pussel|figurer|actionhjält|brädspel|sällskapsspel|lego|playmobil|gosedjur|dockor"), "toys", null],
  [stems(`baby|barnprodukter|barnkläder|barntights|barnstrump|babystrump|barnleggings|barnsock|${W("nappar?|nappflask\\w*")}|blöj`), "baby-kids", null],
  [stems("tandvård|tandkräm|tandborst|munskölj|tandtråd|bindor|tamponger|trosskydd|plåster|kosttillskott|vitaminer"), "health", null],
  [stems("personlig vård|smink|parfym|dofter|hudvård|ansiktsvård|kroppsvård|hårvård|hårstyling|hårfärg|naglar|nagellack|rakning|deodorant|läppstift|läppglans|ögonskugga|ögonfrans|mascara|sminkborst"), "beauty", null],
  [stems("rengör|rengöring|tvätt|klädvård|disk|luftfräsch|toalett|städ|golvmopp|sköljmedel|fläckborttag"), "groceries", "cleaning"],
  [stems("möbler|soffa|fåtölj|madrass|garderob|bokhylla|sängbord"), "furniture", null],
  [stems(`${LIGHTING}|${W("jul\\w*|påsk\\w*")}|dekoration|inredning|textil|handduk|kudd|${W("filt|filtar")}|gardin|sängkläder|förvaring|värmefläkt|ventilator`), "home", null],
  [stems(`köksmaskin|köksredskap|knivar|skärbräd|kastrull|stekpann|bakning|servering|kaffe|${W("kök")}`), "kitchen", null],
  [stems("handverktyg|elverktyg|verktyg & hobby|skruv|borr"), "diy-tools", null],
  [stems("trädgård|odling|växt|krukor|gräsklipp"), "garden", null],
  // Sports before shoes and fashion: "Sport & fritid > Träningsutrustning > Sportflaskor" is sports equipment.
  [stems("sport & fritid|sport & fitness|träningsutrustning|fotboll|träning|gym|löpning|yoga|padel"), "sports", null],
  // "(?<!fla)skor": shoes, but not "flaskor" (bottles); "sneakersockor" are socks.
  [stems("(?<!fla)skor|skosnö|skovård|sulor|stövlar|sneakers(?!ock)|väska|väskor|ryggsäck|plånbok"), "shoes-bags", null],
  [stems("strump|sockor|sokken|socken|tights|trosa|trosor|underkläder|kalsong|boxer|leggings|shapewear|maillot|damasker|benvärmare|kläder|mössa|vantar|halsduk"), "fashion", null],
  [stems("camping|vandring|friluft"), "outdoors", null],
  [stems(`${W("resa|resor")}|resväsk|resetillbehör|bagage`), "travel", null],
];

/** Subcategories within a department, tried in order on the same path. */
const SV_SUBCATEGORIES: Record<string, Rule[]> = {
  // "Auto & cykel" is Bazta's shared car-and-bike section, so only a separate "Cykel…" segment means a bike product.
  automotive: [[stems("motorcykel"), "automotive", "motorcycles"], [stems("(?<!auto & |motor)cykel"), "outdoors", "cycling"]],
  phones: [
    [stems("skal|skärmskydd|fodral|hållare|case"), "phones", "cases"],
    [stems("laddning|uppladdning|laddare|kabel|kablar|powerbank|adapter"), "phones", "chargers"],
    [stems("mobiltelefon|smartphone"), "phones", "smartphones"],
  ],
  electronics: [
    [stems("hörlurar|headset|öronsnäckor"), "electronics", "headphones"],
    [stems("högtalare|soundbar"), "electronics", "speakers"],
    [stems("smart hem|smarta hem|övervakningskamera|säkerhetskamera|hem säkerhet|dörrklock|rökalarm|larm"), "electronics", "smart-home"],
    [new RegExp(W("tv|tv-apparat|television"), "iu"), "electronics", "tv"],
  ],
  "computers-gaming": [
    [stems("spelkonsol|playstation|nintendo|xbox|gaming|handkontroll"), "computers-gaming", "gaming"],
    [stems("surfplatta|ipad"), "computers-gaming", "tablets"],
    [stems("bärbar dator|laptop"), "computers-gaming", "laptops"],
    [stems("bildskärm|skärm"), "computers-gaming", "monitors"],
  ],
  beauty: [
    [stems("smink|naglar|nagellack|läpp|ögon|mascara|foundation|puder|sminkborst"), "beauty", "makeup"],
    [stems("parfym|dofter|eau de|deodorant"), "beauty", "fragrances"],
    [stems("hudvård|ansiktsvård|kroppsvård|ansiktskräm|body lotion|serum"), "beauty", "skin-care"],
  ],
  furniture: [
    [stems("soffa|fåtölj"), "furniture", "sofas"],
    [stems("madrass|säng(?!kläder)"), "furniture", "beds"],
    [stems("garderob|bokhylla|byrå|skåp"), "furniture", "storage"],
  ],
  home: [
    [stems(LIGHTING), "home", "lighting"],
    [stems(`textil|handduk|kudd|${W("filt|filtar")}|gardin|sängkläder`), "home", "textiles"],
    [stems("förvaring|organizer"), "home", "storage"],
    [stems(`${W("jul\\w*|påsk\\w*")}|dekoration|inredning|pynt`), "home", "decor"],
  ],
  kitchen: [
    [stems("kaffe|espressomaskin|kaffebryggare"), "kitchen", "coffee"],
    [stems("kastrull|stekpann|gryta"), "kitchen", "cookware"],
    [stems("köksmaskin|mixer|vattenkokare|brödrost|airfryer"), "kitchen", "small-appliances"],
    [stems("köksredskap|knivar|skärbräd|servering|bakning"), "kitchen", "kitchen-accessories"],
  ],
  "jewelry-watches": [
    [stems("klock|armbandsur"), "jewelry-watches", "watches"],
    [stems("smycke|halsband|örhängen|armband"), "jewelry-watches", "jewellery"],
    [stems("solglasögon"), "jewelry-watches", "sunglasses"],
  ],
  "shoes-bags": [
    [stems("väska|väskor|ryggsäck|plånbok"), "shoes-bags", "bags"],
    [stems("sko|stövlar|sneakers(?!ock)|sulor"), "shoes-bags", "shoes"],
  ],
  sports: [
    [stems("löpning"), "sports", "running"],
    [stems("gym|träning|yoga"), "sports", "fitness"],
    [stems("fotboll|padel"), "sports", "sports-accessories"],
  ],
  outdoors: [[stems("camping|tält|sovsäck"), "outdoors", "camping"], [stems("vandring"), "outdoors", "hiking"]],
};

/** Segments that say nothing about the product type: campaigns, audience labels, very generic parents. */
const NOISE = /^(summer deals|hot deals|black week|black friday|rea|sale|outlet|nyheter|kampanj|erbjudanden|sista storlekarna|gåvor|helgdagar|man|kvinna|kvinnor|män|herr|dam|unisex|kök & hem|hushåll|accessoarer|tillbehör|övrigt|annat|shop)$/i;

/** Swedish shop path → department, or null when the path has no Swedish section words. */
function fromSwedishPath(categoryPath: string | null): Guess | null {
  if (!categoryPath) return null;
  const seen = new Set<string>();
  const text = categoryPath
    .split(">")
    .map((s) => s.trim())
    .filter((s) => s && !NOISE.test(s) && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .join(" > ");
  if (!text) return null;
  for (const [re, dept, sub] of SV_DEPARTMENTS) {
    if (!re.test(text)) continue;
    for (const [sre, sdept, ssub] of SV_SUBCATEGORIES[dept] ?? []) if (sre.test(text)) return { department: sdept, subcategory: ssub };
    return { department: dept, subcategory: sub };
  }
  return null;
}

function match(rules: readonly Rule[], text: string): Guess | null {
  for (const [pattern, department, subcategory] of rules) if (pattern.test(text)) return { department, subcategory };
  return null;
}

/**
 * Department guess for one product. Order:
 *   1. non-new condition → Refurbished;
 *   2. CONTEXT: product-specific conflicts (a make-up "blender" is Beauty, a desk lamp is Lighting);
 *   3. the shop's Swedish category path (most reliable for Swedish feeds; never the product name, which contains
 *      brands and colours such as "Olivia Garden" or "Green Tea");
 *   4. SPECIFIC then GENERAL rules on the leaf category, the product name, then the full path.
 * Pass a CategoryInput to let the most reliable feed field be chosen (see categoryText).
 */
export function guessDepartment(input: CategoryInput, condition?: string): Guess;
export function guessDepartment(categoryPath: string | null, title: string | null, condition: string): Guess;
export function guessDepartment(a: string | null | CategoryInput, b?: string | null, c?: string): Guess {
  const [categoryPath, title, condition] =
    a !== null && typeof a === "object" ? [categoryText(a), a.title ?? null, b ?? "new"] : [a, b ?? null, c ?? "new"];
  const path = words(categoryPath), product = words(title), text = `${path} ${product}`;
  if (condition !== "new") {
    if (/\bphone|smartphone|mobiltelefon/.test(text)) return { department: "refurbished", subcategory: "refurb-phones" };
    if (/laptop|computer|notebook|dator/.test(text)) return { department: "refurbished", subcategory: "refurb-computers" };
    return { department: "refurbished", subcategory: null };
  }
  const context = match(CONTEXT, text);
  if (context) return context;
  const swedish = fromSwedishPath(categoryPath);
  if (swedish) return swedish;
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
