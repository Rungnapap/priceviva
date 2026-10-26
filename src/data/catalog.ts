/**
 * ============================================================================
 *  DEMO CATALOG — EVERYTHING IN THIS FILE IS FICTIONAL
 * ============================================================================
 *  Brands, retailers, products, GTINs, prices, stock and policies are invented
 *  for the Phase 1 prototype. Demo GTINs use the GS1 "200–299" restricted
 *  in-store prefix so they cannot collide with real registered barcodes.
 *  Every record carries `source: "demo"` and the UI labels it as demo content.
 *  Replace only with authorised, verified data (Phase 3+).
 * ============================================================================
 */
import type {
  Brand,
  CostComponent,
  CountryCode,
  CurrencyCode,
  DestinationTerms,
  Offer,
  Product,
  Retailer,
} from "@/lib/types";
import { COUNTRY_CURRENCY, STANDARD_VAT, removeVat } from "@/lib/tax";

// ---------------------------------------------------------------------------
// Brands (fictional)
// ---------------------------------------------------------------------------
const brandList: [string, string][] = [
  ["kestrel-audio", "Kestrel Audio"],
  ["lumora", "Lumora"],
  ["vantor", "Vantor"],
  ["nordvik", "Nordvik"],
  ["corevo", "Corevo"],
  ["aurelo", "Aurelo"],
  ["brisa-kitchen", "Brisa Kitchen"],
  ["haldis-home", "Haldis Home"],
  ["pulsefit", "Pulsefit"],
  ["trailhawk", "Trailhawk"],
  ["fjord-field", "Fjord & Field"],
  ["pantrygold", "Pantrygold"],
];
export const brands: Brand[] = brandList.map(([slug, name]) => ({ slug, name, fictional: true }));

// ---------------------------------------------------------------------------
// Retailers (fictional)
// ---------------------------------------------------------------------------
export const retailers: Retailer[] = [
  { id: "nordhem", name: "Nordhem Elektronik", country: "SE", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "30-day returns (demo policy text).", warranty: "Manufacturer warranty + 3-year consumer rights (demo)." },
  { id: "fjallbod", name: "Fjällbod Outdoor", country: "SE", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "60-day returns on unused items (demo).", warranty: "2-year warranty (demo)." },
  { id: "kvarnbacken", name: "Kvarnbacken Livs", country: "SE", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "Perishables non-returnable (demo).", warranty: "Not applicable." },
  { id: "blauwerk", name: "Blauwerk Technik", country: "DE", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "14-day withdrawal right + 30-day goodwill returns (demo).", warranty: "2-year statutory guarantee (demo)." },
  { id: "lindenhof", name: "Lindenhof Küche & Haus", country: "DE", fictional: true, hasPhysicalStores: false,
    returnsPolicy: "30-day returns (demo).", warranty: "2-year statutory guarantee (demo)." },
  { id: "alpenpfad", name: "Alpenpfad Sport", country: "DE", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "30-day returns (demo).", warranty: "2-year statutory guarantee (demo)." },
  { id: "thamesgate", name: "Thamesgate Electricals", country: "GB", fictional: true, hasPhysicalStores: true,
    returnsPolicy: "28-day returns (demo).", warranty: "1-year manufacturer warranty (demo)." },
  { id: "hollyford", name: "Hollyford Home", country: "GB", fictional: true, hasPhysicalStores: false,
    returnsPolicy: "14-day returns (demo).", warranty: "1-year warranty (demo)." },
  { id: "secondloop", name: "SecondLoop Refurb", country: "DE", fictional: true, hasPhysicalStores: false,
    returnsPolicy: "30-day returns (demo).", warranty: "12-month refurbisher warranty (demo)." },
];

// ---------------------------------------------------------------------------
// Delivery terms per retailer (amounts in the retailer's currency, minor units)
// ---------------------------------------------------------------------------
const known = (minor: number): CostComponent => ({ amountMinor: minor, basis: "verified" });
const unknownShipping: CostComponent = { amountMinor: null, basis: "unknown", note: "Seller has not published shipping cost to this destination." };
const unknownImport: CostComponent = { amountMinor: null, basis: "unknown", note: "Import duty / VAT not provided for this destination." };
const DOMESTIC: CostComponent = { amountMinor: 0, basis: "verified", note: "Domestic delivery — no import charges." };
const EU: CostComponent = { amountMinor: 0, basis: "verified", note: "Within the EU customs union — no import duty or import VAT." };

/** Labeled demo estimate: destination import VAT on the net item price + a fixed handling fee. Duty not modeled. */
function estimatedImport(priceMinor: number, seller: CountryCode, dest: CountryCode): CostComponent {
  const net = removeVat(priceMinor, STANDARD_VAT[seller]);
  const handling = 1000;
  return {
    amountMinor: Math.round(net * STANDARD_VAT[dest]) + handling,
    basis: "estimated",
    note: `Demo estimate: ${Math.round(STANDARD_VAT[dest] * 100)}% import VAT on the net item price + handling fee. Duty not modeled.`,
  };
}

type Terms = (priceMinor: number) => Partial<Record<CountryCode, DestinationTerms>>;

const retailerTerms: Record<string, Terms> = {
  nordhem: () => ({
    SE: { shipping: known(0), importCharges: DOMESTIC, deliveryDays: [1, 2] },
    DE: { shipping: known(14900), importCharges: EU, deliveryDays: [3, 5] },
  }),
  fjallbod: () => ({
    SE: { shipping: known(4900), importCharges: DOMESTIC, deliveryDays: [2, 3] },
    DE: { shipping: unknownShipping, importCharges: EU },
  }),
  kvarnbacken: () => ({
    SE: { shipping: known(5900), importCharges: DOMESTIC, deliveryDays: [1, 1] },
  }),
  blauwerk: (p) => ({
    DE: { shipping: known(0), importCharges: DOMESTIC, deliveryDays: [1, 3] },
    SE: { shipping: known(990), importCharges: EU, deliveryDays: [3, 6] },
    GB: { shipping: known(1490), importCharges: estimatedImport(p, "DE", "GB"), sellerVatRemoved: true, deliveryDays: [4, 8] },
  }),
  lindenhof: () => ({
    DE: { shipping: known(495), importCharges: DOMESTIC, deliveryDays: [2, 4] },
    SE: { shipping: known(1295), importCharges: EU, deliveryDays: [4, 7] },
  }),
  alpenpfad: () => ({
    DE: { shipping: known(395), importCharges: DOMESTIC, deliveryDays: [2, 3] },
    SE: { shipping: unknownShipping, importCharges: EU },
    GB: { shipping: known(1995), importCharges: unknownImport, sellerVatRemoved: true, deliveryDays: [5, 9] },
  }),
  thamesgate: (p) => ({
    GB: { shipping: known(0), importCharges: DOMESTIC, deliveryDays: [1, 2] },
    SE: { shipping: known(1999), importCharges: estimatedImport(p, "GB", "SE"), sellerVatRemoved: true, deliveryDays: [4, 8] },
    DE: { shipping: known(1999), importCharges: estimatedImport(p, "GB", "DE"), sellerVatRemoved: true, deliveryDays: [4, 8] },
  }),
  hollyford: () => ({
    GB: { shipping: known(499), importCharges: DOMESTIC, deliveryDays: [2, 4] },
    SE: { shipping: unknownShipping, importCharges: unknownImport },
    DE: { shipping: unknownShipping, importCharges: unknownImport },
  }),
  secondloop: () => ({
    DE: { shipping: known(0), importCharges: DOMESTIC, deliveryDays: [2, 4] },
    SE: { shipping: known(590), importCharges: EU, deliveryDays: [4, 6] },
  }),
};

// ---------------------------------------------------------------------------
// Products (fictional). Compact rows are expanded below.
// ---------------------------------------------------------------------------
type OfferRow = [
  retailerId: string,
  priceMajor: number,
  extra?: {
    stock?: Offer["stock"];
    daysAgo?: number;
    ref?: [priceMajor: number, evidence: string];
  },
];

interface ProductRow {
  id: string;
  name: string;
  brand: string;
  dept: string;
  sub: string;
  model: string;
  variant: string;
  condition?: Product["condition"];
  art: string;
  desc: string;
  specs: Record<string, string>;
  kw: string[];
  unit?: Product["unit"];
  offers: OfferRow[];
}

const REF = "Demo reference: lowest observed price in the previous 30 days.";

const rows: ProductRow[] = [
  // Electronics -------------------------------------------------------------
  { id: "p01", name: "Aria ANC Wireless Headphones", brand: "kestrel-audio", dept: "electronics", sub: "headphones", model: "KA-ARIA", variant: "Midnight Blue", art: "headphones",
    desc: "Over-ear noise-cancelling headphones with 40-hour battery life and multipoint Bluetooth.",
    specs: { "Battery": "40 h", "Bluetooth": "5.3", "Noise cancelling": "Hybrid ANC", "Weight": "250 g" },
    kw: ["headphones", "noise cancelling", "anc", "bluetooth", "over-ear", "wireless"],
    offers: [["nordhem", 1990, { ref: [2390, REF] }], ["blauwerk", 179], ["thamesgate", 159], ["hollyford", 165]] },
  { id: "p02", name: "Aria ANC Wireless Headphones", brand: "kestrel-audio", dept: "electronics", sub: "headphones", model: "KA-ARIA", variant: "Sand", art: "headphones",
    desc: "The same Aria headphones in the Sand colourway — listed separately because colour variants are priced independently.",
    specs: { "Battery": "40 h", "Bluetooth": "5.3", "Noise cancelling": "Hybrid ANC", "Weight": "250 g" },
    kw: ["headphones", "noise cancelling", "anc", "bluetooth", "beige"],
    offers: [["nordhem", 1990], ["blauwerk", 184]] },
  { id: "p03", name: "Pebble True Wireless Earbuds", brand: "kestrel-audio", dept: "electronics", sub: "headphones", model: "KA-PEB2", variant: "White", art: "earbuds",
    desc: "Compact earbuds with a pocketable charging case and IPX4 splash resistance.",
    specs: { "Battery": "7 h + 21 h case", "Water resistance": "IPX4", "Bluetooth": "5.3" },
    kw: ["earbuds", "earphones", "true wireless", "in-ear"],
    offers: [["nordhem", 990, { ref: [1290, REF] }], ["blauwerk", 89], ["thamesgate", 79]] },
  { id: "p04", name: "Halo Smart Speaker", brand: "lumora", dept: "electronics", sub: "speakers", model: "LM-HALO", variant: "Charcoal", art: "speaker",
    desc: "Room-filling smart speaker with Wi-Fi multiroom and a physical microphone switch.",
    specs: { "Connectivity": "Wi-Fi, Bluetooth", "Drivers": "1 woofer, 2 tweeters", "Mic switch": "Yes" },
    kw: ["speaker", "smart speaker", "wifi", "multiroom"],
    offers: [["nordhem", 1290], ["blauwerk", 119], ["thamesgate", 99]] },
  { id: "p05", name: "Vista 55\" 4K QLED TV", brand: "vantor", dept: "electronics", sub: "tv", model: "55VQ7", variant: "55 inch", art: "tv",
    desc: "55-inch 4K QLED television with Dolby Vision and three HDMI 2.1 ports.",
    specs: { "Screen": "55\" QLED", "Resolution": "3840×2160", "HDR": "Dolby Vision, HDR10+", "HDMI 2.1": "3" },
    kw: ["tv", "television", "4k", "qled", "smart tv"],
    offers: [["nordhem", 7990], ["blauwerk", 699], ["thamesgate", 649, { daysAgo: 12 }]] },
  { id: "p06", name: "Glow Smart Bulb E27 (4-pack)", brand: "lumora", dept: "electronics", sub: "smart-home", model: "LM-GLOW-E27", variant: "4-pack", art: "bulb",
    desc: "Tunable white and colour smart bulbs that work over Wi-Fi without a hub.",
    specs: { "Fitting": "E27", "Brightness": "806 lm", "Colour": "16M colours + tunable white" },
    kw: ["smart bulb", "light bulb", "lighting", "smart home", "e27"],
    offers: [["nordhem", 499], ["blauwerk", 44.99], ["hollyford", 37]] },

  // Phones --------------------------------------------------------------------
  { id: "p07", name: "N7 Smartphone 128 GB", brand: "nordvik", dept: "phones", sub: "smartphones", model: "NV-N7", variant: "128 GB · Graphite", art: "phone",
    desc: "6.4-inch OLED smartphone with a 50 MP main camera and five years of security updates.",
    specs: { "Display": "6.4\" OLED, 120 Hz", "Storage": "128 GB", "Camera": "50 MP + 12 MP", "Battery": "4,700 mAh" },
    kw: ["smartphone", "phone", "mobile", "android", "5g"],
    offers: [["nordhem", 5490], ["blauwerk", 499], ["thamesgate", 449]] },
  { id: "p08", name: "N7 Smartphone 256 GB", brand: "nordvik", dept: "phones", sub: "smartphones", model: "NV-N7", variant: "256 GB · Graphite", art: "phone",
    desc: "The N7 with double the storage. A different variant from the 128 GB model and never merged with it.",
    specs: { "Display": "6.4\" OLED, 120 Hz", "Storage": "256 GB", "Camera": "50 MP + 12 MP", "Battery": "4,700 mAh" },
    kw: ["smartphone", "phone", "mobile", "android", "5g"],
    offers: [["nordhem", 6290], ["blauwerk", 569]] },
  { id: "p09", name: "65W GaN USB-C Charger", brand: "corevo", dept: "phones", sub: "chargers", model: "CV-GAN65", variant: "EU plug", art: "charger",
    desc: "Compact two-port USB-C charger able to power a laptop and phone together.",
    specs: { "Output": "65 W max", "Ports": "2× USB-C", "Plug": "EU Type C/F" },
    kw: ["charger", "usb-c", "gan", "power adapter", "laptop charger"],
    offers: [["nordhem", 449], ["blauwerk", 39.9], ["thamesgate", 32.99, { stock: "out_of_stock" }]] },
  { id: "p10", name: "20,000 mAh Power Bank", brand: "corevo", dept: "phones", sub: "chargers", model: "CV-PB20", variant: "Black", art: "battery",
    desc: "High-capacity power bank with 30 W USB-C PD fast charging.",
    specs: { "Capacity": "20,000 mAh", "Output": "30 W PD", "Ports": "USB-C, USB-A" },
    kw: ["power bank", "battery pack", "portable charger"],
    offers: [["nordhem", 599], ["blauwerk", 49.9], ["hollyford", 42]] },

  // Computers & gaming --------------------------------------------------------
  { id: "p11", name: "Slate 14 Laptop", brand: "aurelo", dept: "computers-gaming", sub: "laptops", model: "AU-SLATE14", variant: "16 GB / 512 GB", art: "laptop",
    desc: "Light 14-inch laptop with an aluminium chassis and an all-day battery.",
    specs: { "Display": "14\" 2.2K IPS", "Memory": "16 GB", "Storage": "512 GB SSD", "Weight": "1.3 kg" },
    kw: ["laptop", "notebook", "ultrabook", "computer"],
    offers: [["nordhem", 11990], ["blauwerk", 1049], ["thamesgate", 949]] },
  { id: "p12", name: "27\" QHD Monitor", brand: "aurelo", dept: "computers-gaming", sub: "monitors", model: "AU-27Q", variant: "27 inch", art: "monitor",
    desc: "27-inch 1440p IPS monitor with USB-C 65 W power delivery.",
    specs: { "Size": "27\"", "Resolution": "2560×1440", "Refresh": "100 Hz", "USB-C": "65 W PD" },
    kw: ["monitor", "display", "screen", "qhd", "1440p"],
    offers: [["nordhem", 2990], ["blauwerk", 259], ["thamesgate", 229]] },
  { id: "p13", name: "Strike Wireless Controller", brand: "vantor", dept: "computers-gaming", sub: "gaming", model: "VT-STRIKE", variant: "Black", art: "gamepad",
    desc: "Wireless controller with hall-effect sticks for PC and mobile.",
    specs: { "Connectivity": "2.4 GHz, Bluetooth", "Sticks": "Hall-effect", "Battery": "30 h" },
    kw: ["controller", "gamepad", "gaming", "joystick"],
    offers: [["nordhem", 649], ["blauwerk", 54.99], ["thamesgate", 44.99]] },
  { id: "p14", name: "Keyline Mechanical Keyboard", brand: "aurelo", dept: "computers-gaming", sub: "gaming", model: "AU-KEYLINE", variant: "Nordic layout", art: "keyboard",
    desc: "Hot-swappable 75% mechanical keyboard. Keyboard layouts are distinct variants.",
    specs: { "Layout": "Nordic (SE/FI/NO/DK)", "Size": "75%", "Switches": "Hot-swap, tactile" },
    kw: ["keyboard", "mechanical keyboard", "gaming keyboard"],
    offers: [["nordhem", 1190], ["blauwerk", 99]] },
  { id: "p15", name: "Keyline Mechanical Keyboard", brand: "aurelo", dept: "computers-gaming", sub: "gaming", model: "AU-KEYLINE", variant: "UK layout", art: "keyboard",
    desc: "The same keyboard with a UK ISO layout — not comparable with the Nordic variant.",
    specs: { "Layout": "UK ISO", "Size": "75%", "Switches": "Hot-swap, tactile" },
    kw: ["keyboard", "mechanical keyboard", "gaming keyboard"],
    offers: [["thamesgate", 84.99]] },

  // Kitchen -------------------------------------------------------------------
  { id: "p16", name: "Barista One Espresso Machine", brand: "brisa-kitchen", dept: "kitchen", sub: "coffee", model: "BK-B1", variant: "Brushed steel", art: "coffee",
    desc: "Single-boiler espresso machine with a steam wand and 58 mm portafilter.",
    specs: { "Pressure": "15 bar", "Portafilter": "58 mm", "Tank": "1.8 L" },
    kw: ["espresso", "coffee machine", "coffee maker", "barista"],
    offers: [["nordhem", 4490], ["lindenhof", 379, { ref: [429, REF] }], ["hollyford", 329]] },
  { id: "p17", name: "Steel Kettle 1.7 L", brand: "brisa-kitchen", dept: "kitchen", sub: "small-appliances", model: "BK-K17", variant: "Steel", art: "kettle",
    desc: "Quiet-boil electric kettle with a removable limescale filter.",
    specs: { "Capacity": "1.7 L", "Power": "2,200 W" },
    kw: ["kettle", "electric kettle", "water boiler"],
    offers: [["nordhem", 499], ["lindenhof", 39.95], ["hollyford", 34]] },
  { id: "p18", name: "Cast-Iron Casserole 4.2 L", brand: "haldis-home", dept: "kitchen", sub: "cookware", model: "HH-CI42", variant: "Deep Red", art: "pot",
    desc: "Enamelled cast-iron casserole suitable for all hobs including induction.",
    specs: { "Capacity": "4.2 L", "Diameter": "24 cm", "Induction": "Yes" },
    kw: ["casserole", "dutch oven", "pot", "cast iron", "cookware"],
    offers: [["lindenhof", 89], ["hollyford", 79], ["nordhem", 1095]] },
  { id: "p19", name: "AirCrisp 5 L Air Fryer", brand: "brisa-kitchen", dept: "kitchen", sub: "small-appliances", model: "BK-AC5", variant: "Black", art: "airfryer",
    desc: "5-litre air fryer with eight presets and a dishwasher-safe basket.",
    specs: { "Capacity": "5 L", "Power": "1,700 W", "Presets": "8" },
    kw: ["air fryer", "fryer", "airfryer"],
    offers: [["nordhem", 1290], ["lindenhof", 109], ["thamesgate", 89]] },

  // Home ----------------------------------------------------------------------
  { id: "p20", name: "Linen Duvet Cover 150×210", brand: "haldis-home", dept: "home", sub: "textiles", model: "HH-LIN150", variant: "Oat", art: "textile",
    desc: "Stone-washed European linen duvet cover with coconut-shell buttons.",
    specs: { "Size": "150×210 cm", "Material": "100% linen" },
    kw: ["duvet cover", "bedding", "linen", "sheets"],
    offers: [["lindenhof", 69], ["hollyford", 59]] },
  { id: "p21", name: "Arc Floor Lamp", brand: "lumora", dept: "home", sub: "lighting", model: "LM-ARC", variant: "Black / Brass", art: "lamp",
    desc: "Arched floor lamp with a dimmable E27 fitting and weighted marble base.",
    specs: { "Height": "190 cm", "Fitting": "E27", "Dimmable": "Yes" },
    kw: ["floor lamp", "lamp", "lighting", "light"],
    offers: [["nordhem", 1490], ["lindenhof", 129], ["hollyford", 119]] },
  { id: "p22", name: "Stackable Storage Boxes (3-pack)", brand: "haldis-home", dept: "home", sub: "storage", model: "HH-BOX3", variant: "Grey", art: "box",
    desc: "Lidded fabric storage boxes that stack securely.",
    specs: { "Pieces": "3", "Size": "40×30×25 cm each" },
    kw: ["storage", "boxes", "organiser", "organizer"],
    offers: [["lindenhof", 34.9], ["hollyford", 29]] },

  // Sports --------------------------------------------------------------------
  { id: "p23", name: "Adjustable Dumbbells 2×24 kg", brand: "pulsefit", dept: "sports", sub: "fitness", model: "PF-AD24", variant: "Pair", art: "dumbbell",
    desc: "Dial-adjustable dumbbells from 2.5 to 24 kg each, replacing 15 pairs.",
    specs: { "Weight range": "2.5–24 kg", "Increments": "15" },
    kw: ["dumbbells", "weights", "home gym", "fitness"],
    offers: [["alpenpfad", 349], ["thamesgate", 299], ["fjallbod", 3990]] },
  { id: "p24", name: "Stride Running Shoes — Men EU 43", brand: "pulsefit", dept: "sports", sub: "running", model: "PF-STRIDE", variant: "Men · EU 43 · Navy", art: "shoe",
    desc: "Cushioned daily trainer. Shoe sizes are separate variants and are never merged.",
    specs: { "Size": "EU 43", "Drop": "8 mm", "Weight": "265 g" },
    kw: ["running shoes", "trainers", "sneakers", "shoes"],
    offers: [["alpenpfad", 129], ["fjallbod", 1499]] },
  { id: "p25", name: "Pulse GPS Sport Watch", brand: "pulsefit", dept: "sports", sub: "wearables", model: "PF-PULSE", variant: "Black", art: "watch",
    desc: "Multi-band GPS watch with heart-rate tracking and a 14-day battery.",
    specs: { "GPS": "Multi-band", "Battery": "14 days", "Water rating": "5 ATM" },
    kw: ["sport watch", "gps watch", "smartwatch", "running watch", "wearable"],
    offers: [["alpenpfad", 229], ["nordhem", 2590], ["thamesgate", 199]] },
  { id: "p26", name: "Recovery Foam Roller", brand: "pulsefit", dept: "sports", sub: "fitness", model: "PF-ROLL", variant: "45 cm", art: "roller",
    desc: "Textured high-density foam roller for warm-ups and recovery.",
    specs: { "Length": "45 cm", "Diameter": "14 cm" },
    kw: ["foam roller", "recovery", "massage"],
    offers: [["alpenpfad", 24.9], ["fjallbod", 299]] },

  // Outdoors ------------------------------------------------------------------
  { id: "p27", name: "Ridge 2-Person Tent", brand: "trailhawk", dept: "outdoors", sub: "camping", model: "TH-RIDGE2", variant: "Olive", art: "tent",
    desc: "Freestanding three-season tent with two doors and two vestibules.",
    specs: { "Capacity": "2 people", "Weight": "1.9 kg", "Seasons": "3" },
    kw: ["tent", "camping", "backpacking", "shelter"],
    offers: [["fjallbod", 2990, { ref: [3490, REF] }], ["alpenpfad", 259], ["hollyford", 239]] },
  { id: "p28", name: "Summit 30 L Daypack", brand: "trailhawk", dept: "outdoors", sub: "hiking", model: "TH-SUM30", variant: "Slate", art: "backpack",
    desc: "Ventilated hiking daypack with a rain cover and hydration sleeve.",
    specs: { "Volume": "30 L", "Weight": "980 g" },
    kw: ["backpack", "daypack", "rucksack", "hiking bag"],
    offers: [["fjallbod", 899], ["alpenpfad", 79]] },
  { id: "p29", name: "Insulated Bottle 750 ml", brand: "fjord-field", dept: "outdoors", sub: "hiking", model: "FF-BOT750", variant: "Fjord Blue", art: "bottle",
    desc: "Double-wall steel bottle keeping drinks cold for 24 hours.",
    specs: { "Volume": "750 ml", "Material": "18/8 steel" },
    kw: ["water bottle", "flask", "thermos", "bottle"],
    offers: [["fjallbod", 299], ["alpenpfad", 27.9], ["hollyford", 22]] },
  { id: "p30", name: "Commuter Bike Light Set", brand: "trailhawk", dept: "outdoors", sub: "cycling", model: "TH-LUX", variant: "Front + rear", art: "bikelight",
    desc: "USB-C rechargeable front and rear lights, StVZO-style cut-off beam.",
    specs: { "Front": "400 lm", "Rear": "40 lm", "Charging": "USB-C" },
    kw: ["bike light", "bicycle light", "cycling", "lights"],
    offers: [["fjallbod", 349], ["alpenpfad", 32]] },

  // Groceries -----------------------------------------------------------------
  { id: "p31", name: "Organic Coffee Beans Medium Roast 1 kg", brand: "pantrygold", dept: "groceries", sub: "drinks", model: "PG-CB-MED", variant: "1 kg", art: "beans",
    desc: "Whole-bean organic arabica, medium roast. Compare by price per kg.",
    specs: { "Weight": "1 kg", "Roast": "Medium", "Organic": "Yes (demo claim)" },
    kw: ["coffee", "coffee beans", "espresso beans", "arabica"],
    unit: { quantity: 1, unit: "kg" },
    offers: [["kvarnbacken", 189], ["lindenhof", 17.9]] },
  { id: "p32", name: "Organic Coffee Beans Medium Roast 500 g", brand: "pantrygold", dept: "groceries", sub: "drinks", model: "PG-CB-MED", variant: "500 g", art: "beans",
    desc: "The same beans in a 500 g bag — a different pack size, so it is compared by unit price.",
    specs: { "Weight": "500 g", "Roast": "Medium", "Organic": "Yes (demo claim)" },
    kw: ["coffee", "coffee beans", "espresso beans", "arabica"],
    unit: { quantity: 0.5, unit: "kg" },
    offers: [["kvarnbacken", 109], ["lindenhof", 9.9]] },
  { id: "p33", name: "Extra Virgin Olive Oil 1 L", brand: "pantrygold", dept: "groceries", sub: "pantry", model: "PG-EVOO", variant: "1 L", art: "oil",
    desc: "Cold-pressed extra virgin olive oil in a dark glass bottle.",
    specs: { "Volume": "1 L" },
    kw: ["olive oil", "oil", "cooking oil"],
    unit: { quantity: 1, unit: "l" },
    offers: [["kvarnbacken", 129], ["lindenhof", 12.5]] },
  { id: "p34", name: "Eco Dishwasher Tablets (60-pack)", brand: "pantrygold", dept: "groceries", sub: "cleaning", model: "PG-DISH60", variant: "60 tablets", art: "tablets",
    desc: "Phosphate-free dishwasher tablets with a water-soluble wrap.",
    specs: { "Count": "60" },
    kw: ["dishwasher tablets", "detergent", "cleaning"],
    unit: { quantity: 60, unit: "pcs" },
    offers: [["kvarnbacken", 99]] },

  // Refurbished ---------------------------------------------------------------
  { id: "p35", name: "N7 Smartphone 128 GB — Refurbished Grade A", brand: "nordvik", dept: "refurbished", sub: "refurb-phones", model: "NV-N7", variant: "128 GB · Graphite", condition: "refurbished", art: "phone",
    desc: "Professionally tested N7 with minimal signs of use. Condition is a separate listing from new units.",
    specs: { "Grade": "A (demo grading)", "Battery health": "≥ 90%", "Storage": "128 GB" },
    kw: ["refurbished phone", "used phone", "smartphone", "second hand"],
    offers: [["secondloop", 349], ["nordhem", 3990]] },
  { id: "p36", name: "Slate 14 Laptop — Refurbished Grade B", brand: "aurelo", dept: "refurbished", sub: "refurb-computers", model: "AU-SLATE14", variant: "16 GB / 512 GB", condition: "refurbished", art: "laptop",
    desc: "Fully functional Slate 14 with visible cosmetic wear.",
    specs: { "Grade": "B (demo grading)", "Battery health": "≥ 85%", "Memory": "16 GB" },
    kw: ["refurbished laptop", "used laptop", "second hand", "notebook"],
    offers: [["secondloop", 649]] },
];

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Build a 13-digit demo GTIN in the GS1 restricted range (prefix 2xx) with a valid check digit. */
export function demoGtin(seq: number): string {
  const body = `20012345${String(seq).padStart(4, "0")}`; // 12 digits
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return body + String(check);
}

const toMinor = (major: number) => Math.round(major * 100);

export const products: Product[] = rows.map((r, i) => ({
  id: r.id,
  slug: slugify(`${brands.find((b) => b.slug === r.brand)?.name ?? r.brand} ${r.name} ${r.variant}`),
  name: r.name,
  brand: r.brand,
  department: r.dept,
  subcategory: r.sub,
  model: r.model,
  variant: r.variant,
  gtin: demoGtin(i + 1),
  condition: r.condition ?? "new",
  description: r.desc,
  specs: r.specs,
  keywords: r.kw,
  art: r.art,
  unit: r.unit,
  source: "demo",
}));

export const offers: Offer[] = rows.flatMap((r) =>
  r.offers.map(([retailerId, priceMajor, extra], j) => {
    const retailer = retailers.find((x) => x.id === retailerId);
    if (!retailer) throw new Error(`Unknown retailer ${retailerId}`);
    const currency: CurrencyCode = COUNTRY_CURRENCY[retailer.country];
    const minor = toMinor(priceMajor);
    const terms = retailerTerms[retailerId];
    if (!terms) throw new Error(`No terms for ${retailerId}`);
    const offer: Offer = {
      id: `${r.id}-o${j + 1}`,
      productId: r.id,
      retailerId,
      price: { minor, currency },
      vatIncluded: true,
      shipFrom: retailer.country,
      stock: extra?.stock ?? (j === 1 ? "low_stock" : "in_stock"),
      destinations: terms(minor),
      reference: extra?.ref ? { price: { minor: toMinor(extra.ref[0]), currency }, evidence: extra.ref[1] } : undefined,
      observedDaysAgo: extra?.daysAgo ?? (j % 3),
      sourceUrl: null,
      source: "demo",
    };
    return offer;
  }),
);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
export const getProduct = (idOrSlug: string) => products.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
export const getBrand = (slug: string) => brands.find((b) => b.slug === slug);
export const getRetailer = (id: string) => retailers.find((r) => r.id === id);
export const offersFor = (productId: string) => offers.filter((o) => o.productId === productId);
export const productsInDepartment = (dept: string) => products.filter((p) => p.department === dept);
