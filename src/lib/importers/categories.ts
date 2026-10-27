/**
 * Automatic first-guess mapping from a source category path (e.g. "Electronics > Audio > Headphones")
 * to a PriceAtlas department/subcategory. Admins can override any source category in /admin;
 * manual mappings always win. Anything not matched stays unmapped (shown in search, flagged in admin).
 */
type Rule = [RegExp, string, string | null];

const RULES: Rule[] = [
    // Children's clothing - check before general clothing
  [
  /barnstrump|babystrump|barntights|barnleggings|barnstrumpbyxor|kn\u00e4strumpor f\u00f6r barn/,
    "baby-kids",
    null,
  ],

  // Socks and hosiery - Swedish, Dutch and English
  [
    /strump|sockor|socken|sokken|socks?|hosiery|tights|strumpbyxor|kousen/,
    "fashion",
    null,
  ],

  // Underwear and leggings
  [
    /underkläder|underklader|underwear|trosa|trosor|boxer shorts|boxershorts|leggings/,
    "fashion",
    null,
  ],

  // Football and Swedish sports categories
  [
    /fotboll|football|soccer/,
    "sports",
    null,
  ],
  // Order matters: more specific first.

  [/coffee beans|ground coffee|\btea\b|coffee pods|capsules/, "groceries", "drinks"],
  [/head ?phone|earphone|ear ?bud|headset/, "electronics", "headphones"],
  [/speaker|soundbar|hi-?fi/, "electronics", "speakers"],
  [/television|\btvs?\b|oled|qled/, "electronics", "tv"],
  [/smart home|smart plug|light bulb|smart bulb|security camera/, "electronics", "smart-home"],
  [/phone case|screen protector/, "phones", "cases"],
  [/charger|power bank|charging|usb cable|adapter/, "phones", "chargers"],
  [/mobile phone|smartphone|cell phone|\bphones?\b/, "phones", "smartphones"],
  [/laptop|notebook|chromebook|macbook/, "computers-gaming", "laptops"],
  [/monitor|display screen/, "computers-gaming", "monitors"],
  [/gaming|console|controller|gamepad|keyboard|\bmouse\b|video game/, "computers-gaming", "gaming"],
  [/espresso|coffee machine|coffee maker/, "kitchen", "coffee"],
  [/cookware|frying pan|saucepan|casserole|\bpots?\b|\bpans?\b/, "kitchen", "cookware"],
  [/kettle|toaster|blender|air ?fryer|microwave|food processor|kitchen appliance/, "kitchen", "small-appliances"],
  [/lighting|\blamps?\b|ceiling light/, "home", "lighting"],
  [/bedding|duvet|towel|curtain|cushion|textile|rug/, "home", "textiles"],
  [/storage|organis|organiz|shelving/, "home", "storage"],
  [/furniture|sofa|chair|table|home/, "home", null],
  [/sport.?watch|fitness tracker|gps watch/, "sports", "wearables"],
  [/running/, "sports", "running"],
  [/fitness|gym|weights|dumbbell|yoga|exercise/, "sports", "fitness"],
  [/sport/, "sports", null],
  [/camping|\btents?\b|sleeping bag/, "outdoors", "camping"],
  [/hiking|backpack|rucksack|trekking/, "outdoors", "hiking"],
  [/cycling|bicycle|\bbikes?\b/, "outdoors", "cycling"],
  [/outdoor/, "outdoors", null],
  [/cleaning|detergent|dishwasher tablet|laundry/, "groceries", "cleaning"],
  [/grocer|food|pantry|snack|beverage|drink/, "groceries", "pantry"],
  [/shoe|trainer|sneaker|boot|handbag|\bbags?\b/, "shoes-bags", null],
  [/clothing|apparel|fashion|dress|shirt|jacket|trousers|jeans/, "fashion", null],
  [/beauty|skincare|make-?up|cosmetic|fragrance|perfume/, "beauty", null],
  [/\btoys?\b|board game|puzzle|lego/, "toys", null],
  [/\bbaby\b|nursery|\bkids?\b|children/, "baby-kids", null],
  [/automotive|\bcar\b|motoring/, "automotive", null],
  [/\btools?\b|\bdiy\b|hardware|drill/, "diy-tools", null],
  [/garden|lawn|plant/, "garden", null],
  [/\bpets?\b|\bdog\b|\bcat\b/, "pets", null],
  [/\bbooks?\b|education/, "books", null],
  [/office|stationery/, "office", null],
  [/jewel|\bwatch(es)?\b/, "jewelry-watches", null],
  [/health|wellness|vitamin/, "health", null],
  [/luggage|suitcase|travel/, "travel", null],
  [/audio|electronic|camera/, "electronics", null],
  [/computer|tablet/, "computers-gaming", null],
];

export function guessDepartment(categoryPath: string | null, title: string | null, condition: string): { department: string | null; subcategory: string | null } {
  const text = `${categoryPath ?? ""} ${title ?? ""}`.toLowerCase();
  if (condition !== "new") {
    if (/phone/.test(text)) return { department: "refurbished", subcategory: "refurb-phones" };
    if (/laptop|computer|notebook/.test(text)) return { department: "refurbished", subcategory: "refurb-computers" };
    return { department: "refurbished", subcategory: null };
  }
  // Category path is more reliable than the title: try it alone first.
  for (const source of [`${categoryPath ?? ""}`.toLowerCase(), text]) {
    if (!source.trim()) continue;
    for (const [re, dept, sub] of RULES) if (re.test(source)) return { department: dept, subcategory: sub };
  }
  return { department: null, subcategory: null };
}
