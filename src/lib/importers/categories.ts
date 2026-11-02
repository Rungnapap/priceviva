/**
 * Automatic first-guess mapping from a retailer's own category data to a PriceViva department/subcategory.
 * Admins can override any source category in /admin; manual mappings always win. Anything not matched stays
 * unmapped (shown in search, flagged in admin).
 *
 * Feeds describe categories differently (checked against the live Awin feeds):
 *   - Bazta: a full Swedish path, e.g. "Man > Kvinna > Personlig vård > Parfymer & dofter > Eau de parfum > SUMMER DEALS"
 *   - Strumpor-online: Awin's own English category ("Men's Socks"); its shop category is often a campaign ("Sista storlekarna")
 *   - Deluxehomeartshop: only a product type ("LED Blockljus")
 * So every category field is tried in order of reliability, and the product NAME is used only when a row has no
 * category data at all: names contain brands and colours ("Olivia Garden" hairbrush, "Green Tea" deodorant,
 * "Espresso" socks) that look like categories but are not.
 *
 * Matching treats å, ä and ö as letters (JavaScript's \b does not), so "tv" never matches "tvätt" or "tvål".
 */

export interface CategoryInput {
  /** merchant_product_category_path */
  path?: string | null;
  /** category_name: Awin's standard (English) category */
  categoryName?: string | null;
  /** product_type */
  productType?: string | null;
  /** merchant_category */
  merchantCategory?: string | null;
  /** google_product_category */
  googleCategory?: string | null;
  title?: string | null;
  condition?: string;
}

export interface CategoryGuess {
  department: string | null;
  subcategory: string | null;
}

type Rule = [RegExp, string, string | null];

/** A whole word, with å/ä/ö (and every other letter or digit) counted as part of a word. */
const W = (pattern: string) => `(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`;
/** Whole words only. */
const words = (pattern: string) => new RegExp(W(pattern), "iu");
/** Word stems that may sit inside Swedish compounds ("Herrstrumpor", "Barntights"). Use W() for short words. */
const stems = (pattern: string) => new RegExp(pattern, "iu");

// -----------------------------------------------------------------------------------------------------------------
// Adult products are not imported (owner decision, Nov 2026): a general shopping site, SafeSearch and affiliate rules.
// -----------------------------------------------------------------------------------------------------------------
const ADULT_PATH = stems("vuxen ?leksak|sexleksak|erotik|glidmedel|kondom|adult toys?|sex toys?|lubricant|condoms?");
const ADULT_TITLE = words("vibrator(er|ägg)?|dildos?|dildo|kondom(er)?|condoms?|glidmedel|lubricant|penisring|cockring|analplugg?|butt ?plugs?|sexleksak(er)?|bdsm|bondage|bäckenbottenkulor|love ?eggs?");

/** True for adult/erotic products. These rows are skipped by the importer. */
export function isAdultProduct(input: CategoryInput): boolean {
  const segs = segments(input.path);
  // "Personlig vård > Intim > …" is the adult section; "Rakning & hårborttagning > Intim" (bikini trimmers) is not.
  const intim = segs.some((s, i) => /^intim$/i.test(s) && !/rakning|hårborttagning/i.test(segs[i - 1] ?? ""));
  const cats = [input.path, input.categoryName, input.productType, input.merchantCategory, input.googleCategory].filter(Boolean).join(" > ");
  return intim || ADULT_PATH.test(cats) || ADULT_TITLE.test(input.title ?? "");
}

// -----------------------------------------------------------------------------------------------------------------
// Swedish category paths. The department comes from the first rule that matches anywhere in the cleaned path,
// so the order is the priority: "Husdjurstillbehör > Leksak" is Pets (not Toys), "Barn > … > Leksaker" is Toys.
// -----------------------------------------------------------------------------------------------------------------
// LED candles and lights (Deluxehomeartshop's product types: "LED Blockljus", "LED Kegelljus", "Gravljus", "LED Form").
const LIGHTING = `belysning|ljus|lampa|lampor|harlequin|${W("led")}`;

const SV_DEPARTMENTS: Rule[] = [
  [stems("husdjur|hundleksak|kattleksak|hundbädd|kattsand"), "pets", null],
  [stems("auto & cykel|biltillbehör|bilvård|cykel"), "automotive", null],
  // Watches before phones: Bazta files watches under "Klockor & Smartwatches". "Dörrklockor" are doorbells.
  [stems("(?<!dörr)klockor|(?<!dörr)klocka|armbandsur|smycke|halsband|örhängen|solglasögon"), "jewelry-watches", null],
  [stems("spelkonsol|playstation|nintendo|xbox|datortillbehör|dator"), "computers-gaming", null],
  [stems("mobil|surfplatta|smartwatch|laddning|uppladdning"), "phones", null],
  [stems(`elektronik|kablar|hörlurar|högtalare|batteri|hem säkerhet|dörrklock|rökalarm|${W("tv")}`), "electronics", null],
  [stems("leksak|aktivitet & lek|pussel|figurer|actionhjält|brädspel|sällskapsspel|lego|playmobil|gosedjur|dockor"), "toys", null],
  [stems(`baby|barnprodukter|barnkläder|barntights|barnstrump|babystrump|barnleggings|barnsock|${W("nappar?|nappflask\\w*")}|blöj`), "baby-kids", null],
  [stems("tandvård|tandkräm|tandborst|munskölj|tandtråd|bindor|tamponger|trosskydd|plåster|kosttillskott|vitaminer"), "health", null],
  [stems("personlig vård|smink|parfym|dofter|hudvård|ansiktsvård|kroppsvård|hårvård|hårstyling|hårfärg|naglar|nagellack|rakning|deodorant|läppstift|läppglans|ögonskugga|ögonfrans|mascara|sminkborst"), "beauty", null],
  [stems("rengör|rengöring|tvätt|klädvård|disk|luftfräsch|toalett|städ|golvmopp|sköljmedel|fläckborttag"), "groceries", "cleaning"],
  [stems(`${LIGHTING}|${W("jul\\w*|påsk\\w*")}|dekoration|inredning|textil|handduk|kudd|${W("filt|filtar")}|gardin|sängkläder|förvaring|möbler|värmefläkt|ventilator`), "home", null],
  [stems(`köksmaskin|köksredskap|knivar|skärbräd|kastrull|stekpann|bakning|servering|kaffe|${W("kök")}`), "kitchen", null],
  [stems("handverktyg|elverktyg|verktyg & hobby|skruv|borr"), "diy-tools", null],
  [stems("trädgård|odling|växt|krukor|gräsklipp"), "garden", null],
  // Sports before shoes and fashion: "Sport & fritid > Träningsutrustning > Sportflaskor" is sports equipment.
  [stems("sport & fritid|sport & fitness|träningsutrustning|fotboll|träning|gym|löpning|yoga|padel"), "sports", null],
  // "(?<!fla)skor": shoes, but not "flaskor" (bottles).
  [stems("(?<!fla)skor|skosnö|skovård|sulor|stövlar|sneakers(?!ock)|väska|väskor|ryggsäck|plånbok"), "shoes-bags", null],
  [stems("strump|sockor|sokken|socken|tights|trosa|trosor|underkläder|kalsong|boxer|leggings|shapewear|maillot|damasker|benvärmare|kläder|mössa|vantar|halsduk"), "fashion", null],
  [stems("sport"), "sports", null],
  [stems("camping|vandring|friluft|outdoor"), "outdoors", null],
  [stems(`${W("resa|resor")}|resväsk|resetillbehör|bagage`), "travel", null],
  [stems(`kontor|skrivbord|${W("pennor|penna")}|anteckningsbok`), "office", null],
  [stems(`böcker|${W("bok")}`), "books", null],
  [stems(`${W("mat|matvaror")}|livsmedel|godis|snacks|dryck|${W("te")}`), "groceries", "pantry"],
];

/** Subcategories within a department, tried in order on the same cleaned path. */
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
    [words("tv|tv-apparat|television"), "electronics", "tv"],
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
  home: [
    [stems(LIGHTING), "home", "lighting"],
    [stems(`textil|handduk|kudd|${W("filt|filtar")}|gardin|sängkläder`), "home", "textiles"],
    [stems("förvaring|organizer"), "home", "storage"],
    [stems("möbler"), "home", "furniture"],
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
  sports: [[stems("löpning"), "sports", "running"], [stems("gym|träning|yoga"), "sports", "fitness"]],
  outdoors: [[stems("camping|tält|sovsäck"), "outdoors", "camping"], [stems("vandring"), "outdoors", "hiking"]],
};

// -----------------------------------------------------------------------------------------------------------------
// English categories (Awin category_name, Google product categories, English shop paths). Whole words only.
// -----------------------------------------------------------------------------------------------------------------
const EN_RULES: Rule[] = [
  [words("pet supplies|pets?|dogs?|cats?"), "pets", null],
  [words("children'?s clothing|girls'? clothes|boys'? clothes|baby clothes|baby|babies|nursery|kids|children"), "baby-kids", null],
  [words("toys?|board games?|puzzles?|lego"), "toys", null],
  [words("head ?phones?|earphones?|ear ?buds?|headsets?"), "electronics", "headphones"],
  [words("speakers?|soundbars?|hi-?fi"), "electronics", "speakers"],
  [words("televisions?|tvs?|oled|qled"), "electronics", "tv"],
  [words("smart home|smart plugs?|smart bulbs?|security cameras?|home security"), "electronics", "smart-home"],
  [words("phone cases?|screen protectors?"), "phones", "cases"],
  [words("chargers?|power banks?|charging|usb cables?"), "phones", "chargers"],
  [words("mobile phones?|smartphones?|cell phones?"), "phones", "smartphones"],
  [words("laptops?|notebooks?|chromebooks?|macbooks?"), "computers-gaming", "laptops"],
  [words("monitors?"), "computers-gaming", "monitors"],
  [words("video games?|gaming|consoles?|gamepads?|game controllers?"), "computers-gaming", "gaming"],
  [words("tablets?"), "computers-gaming", "tablets"],
  [words("coffee machines?|coffee makers?|espresso machines?"), "kitchen", "coffee"],
  [words("cookware|frying pans?|saucepans?|casseroles?"), "kitchen", "cookware"],
  [words("kettles?|toasters?|blenders?|air ?fryers?|microwaves?|food processors?|kitchen appliances?"), "kitchen", "small-appliances"],
  [words("kitchen|kitchenware"), "kitchen", null],
  [words("coffee beans|ground coffee|coffee pods|tea"), "groceries", "drinks"],
  [words("cleaning|detergents?|laundry|dishwasher tablets?|household supplies"), "groceries", "cleaning"],
  [words("grocery|groceries|food|pantry|snacks?|beverages?|drinks?"), "groceries", "pantry"],
  [words("skincare|skin care"), "beauty", "skin-care"],
  [words("make-?up|cosmetics?"), "beauty", "makeup"],
  [words("fragrances?|perfumes?"), "beauty", "fragrances"],
  [words("beauty|grooming|hair care|personal care"), "beauty", null],
  [words("health|wellness|vitamins?|supplements?|oral care"), "health", null],
  [words("lighting|lamps?|ceiling lights?|candles?"), "home", "lighting"],
  [words("bedding|duvets?|towels?|curtains?|cushions?|textiles?|rugs?"), "home", "textiles"],
  [words("storage|shelving"), "home", "storage"],
  [words("furniture|sofas?|chairs?|tables?"), "home", "furniture"],
  [words("home d[eé]cor|decorations?|christmas"), "home", "decor"],
  [words("home|household"), "home", null],
  [words("fitness trackers?|gps watch(es)?|sports? watch(es)?"), "sports", "wearables"],
  [words("running"), "sports", "running"],
  [words("fitness|gym|weights|dumbbells?|yoga|exercise"), "sports", "fitness"],
  [words("camping|tents?|sleeping bags?"), "outdoors", "camping"],
  [words("hiking|trekking"), "outdoors", "hiking"],
  [words("cycling|bicycles?|bikes?"), "outdoors", "cycling"],
  [words("outdoors?"), "outdoors", null],
  [words("watch(es)?"), "jewelry-watches", "watches"],
  [words("jewell?ery"), "jewelry-watches", "jewellery"],
  [words("sunglasses"), "jewelry-watches", "sunglasses"],
  [words("shoes?|trainers?|sneakers?|boots?|footwear"), "shoes-bags", "shoes"],
  [words("handbags?|bags?|backpacks?|rucksacks?|luggage"), "shoes-bags", "bags"],
  [words("men'?s socks|men'?s underwear|men'?s clothing|men'?s sportswear|menswear"), "fashion", "mens"],
  [words("women'?s socks|women'?s underwear|women'?s clothing|womenswear|lingerie"), "fashion", "womens"],
  [words("socks|hosiery|tights|underwear|clothing|clothes|apparel|fashion|fancy dress|sportswear|dress(es)?|shirts?|jackets?|trousers|jeans"), "fashion", null],
  [words("sports?|football|soccer"), "sports", null],
  [words("automotive|cars?|motoring|car care"), "automotive", null],
  [words("tools?|diy|hardware|drills?"), "diy-tools", null],
  [words("garden(ing)?|lawn|plants?"), "garden", null],
  [words("books?|education"), "books", null],
  [words("office|stationery"), "office", null],
  [words("travel accessories|suitcases?"), "travel", null],
  [words("electronics?|audio|cameras?"), "electronics", null],
  [words("computers?"), "computers-gaming", null],
];

/** Segments that say nothing about the product type: campaigns, audience labels, very generic parents. */
const NOISE = /^(summer deals|hot deals|black week|black friday|rea|sale|outlet|nyheter|kampanj|erbjudanden|sista storlekarna|gåvor|helgdagar|man|kvinna|kvinnor|män|herr|dam|unisex|kök & hem|hushåll|accessoarer|tillbehör|övrigt|annat)$/i;

function segments(path: string | null | undefined): string[] {
  if (!path) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of path.split(">")) {
    const s = raw.trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

const clean = (path: string | null | undefined) => segments(path).filter((s) => !NOISE.test(s)).join(" > ");

function fromSwedish(text: string): CategoryGuess | null {
  if (!text) return null;
  for (const [re, dept, sub] of SV_DEPARTMENTS) {
    if (!re.test(text)) continue;
    for (const [sre, sdept, ssub] of SV_SUBCATEGORIES[dept] ?? []) if (sre.test(text)) return { department: sdept, subcategory: ssub };
    return { department: dept, subcategory: sub };
  }
  return null;
}

function fromEnglish(text: string): CategoryGuess | null {
  if (!text) return null;
  for (const [re, department, subcategory] of EN_RULES) if (re.test(text)) return { department, subcategory };
  return null;
}

const KIDS_TITLE = stems(`${W("barn|baby|bebis|kids|children'?s?")}|barnstrump|babystrump|barnsock|barntights|flickstrump|pojkstrump`);

const swedishFirst = (text: string) => fromSwedish(text) ?? fromEnglish(text);
const englishFirst = (text: string) => fromEnglish(text) ?? fromSwedish(text);

export function guessDepartment(input: CategoryInput): CategoryGuess {
  const condition = input.condition ?? "new";
  if (condition !== "new") {
    const text = [input.path, input.categoryName, input.productType, input.merchantCategory, input.title].filter(Boolean).join(" ");
    if (words("phones?|smartphones?|mobiltelefon(er)?|iphone").test(text)) return { department: "refurbished", subcategory: "refurb-phones" };
    if (words("laptops?|computers?|notebooks?|dator(er)?|macbook").test(text)) return { department: "refurbished", subcategory: "refurb-computers" };
    return { department: "refurbished", subcategory: null };
  }
  // Category data, most reliable first. Awin's and Google's categories are English; shop data is mostly Swedish.
  const sources: [string, (t: string) => CategoryGuess | null][] = [
    [clean(input.path), swedishFirst],
    [clean(input.categoryName), englishFirst],
    [clean(input.productType), swedishFirst],
    [clean(input.merchantCategory), swedishFirst],
    [clean(input.googleCategory), englishFirst],
  ];
  for (const [text, guess] of sources) {
    const g = guess(text);
    if (!g) continue;
    // Shops file some children's socks under "Men's Socks"; a name that says so ("…för barn") is clear enough.
    if (g.department === "fashion" && KIDS_TITLE.test(input.title ?? "")) return { department: "baby-kids", subcategory: null };
    return g;
  }
  // The product name only when the row has no category data at all (names contain brands and colours).
  const hasCategoryData = [input.path, input.categoryName, input.productType, input.merchantCategory, input.googleCategory].some((s) => s && s.trim());
  if (!hasCategoryData && input.title) return swedishFirst(input.title) ?? { department: null, subcategory: null };
  return { department: null, subcategory: null };
}
