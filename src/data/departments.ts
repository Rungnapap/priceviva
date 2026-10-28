import type { Department } from "@/lib/types";

/**
 * Full department hierarchy from the spec. Only some departments are populated
 * with (fictional, labeled) demo products in Phase 1; the rest render an honest
 * "no products yet" state instead of invented listings.
 */
export const departments: Department[] = [
  { slug: "electronics", name: "Electronics", tagline: "Audio, TV and smart home", icon: "tv", hue: 220, populated: true,
    subcategories: [{ slug: "headphones", name: "Headphones" }, { slug: "speakers", name: "Speakers" }, { slug: "tv", name: "TVs" }, { slug: "smart-home", name: "Smart home" }] },
  { slug: "phones", name: "Phones & Accessories", tagline: "Smartphones, cases and chargers", icon: "smartphone", hue: 250, populated: true,
    subcategories: [{ slug: "smartphones", name: "Smartphones" }, { slug: "chargers", name: "Chargers & power" }, { slug: "cases", name: "Cases" }, { slug: "accessories", name: "Accessories" }] },
  { slug: "computers-gaming", name: "Computers & Gaming", tagline: "Laptops, monitors, controllers", icon: "laptop", hue: 205, populated: true,
    subcategories: [{ slug: "laptops", name: "Laptops" }, { slug: "tablets", name: "Tablets" }, { slug: "monitors", name: "Monitors" }, { slug: "gaming", name: "Gaming gear" }] },
  { slug: "kitchen", name: "Kitchen & Appliances", tagline: "Coffee, cooking and cleaning", icon: "chef-hat", hue: 25, populated: true,
    subcategories: [{ slug: "coffee", name: "Coffee machines" }, { slug: "cookware", name: "Cookware" }, { slug: "small-appliances", name: "Small appliances" }, { slug: "kitchen-accessories", name: "Kitchen accessories" }] },
  { slug: "home", name: "Home & Living", tagline: "Lighting, textiles and storage", icon: "sofa", hue: 35, populated: true,
    subcategories: [{ slug: "lighting", name: "Lighting" }, { slug: "textiles", name: "Textiles" }, { slug: "storage", name: "Storage" }, { slug: "furniture", name: "Furniture" }, { slug: "decor", name: "Decor" }] },
  { slug: "sports", name: "Sports & Fitness", tagline: "Training, running and recovery", icon: "dumbbell", hue: 150, populated: true,
    subcategories: [{ slug: "fitness", name: "Fitness equipment" }, { slug: "running", name: "Running" }, { slug: "wearables", name: "Sports wearables" }, { slug: "sports-accessories", name: "Sports accessories" }] },
  { slug: "outdoors", name: "Outdoors", tagline: "Camping, hiking and trail", icon: "tent", hue: 120, populated: true,
    subcategories: [{ slug: "camping", name: "Camping" }, { slug: "hiking", name: "Hiking" }, { slug: "cycling", name: "Cycling" }] },
  { slug: "groceries", name: "Groceries & Household", tagline: "Pantry, coffee beans and cleaning", icon: "shopping-basket", hue: 85, populated: true,
    subcategories: [{ slug: "pantry", name: "Pantry" }, { slug: "drinks", name: "Coffee & tea" }, { slug: "cleaning", name: "Cleaning" }] },
  { slug: "refurbished", name: "Second-hand & Refurbished", tagline: "Graded, tested, re-sold", icon: "recycle", hue: 170, populated: true,
    subcategories: [{ slug: "refurb-phones", name: "Refurbished phones" }, { slug: "refurb-computers", name: "Refurbished computers" }] },
  { slug: "fashion", name: "Fashion", tagline: "Clothing for every season", icon: "shirt", hue: 330, populated: false,
    subcategories: [{ slug: "mens", name: "Men" }, { slug: "womens", name: "Women" }] },
  { slug: "shoes-bags", name: "Shoes & Bags", tagline: "Footwear and carry", icon: "footprints", hue: 15, populated: false,
    subcategories: [{ slug: "shoes", name: "Shoes" }, { slug: "bags", name: "Bags" }] },
  { slug: "beauty", name: "Beauty", tagline: "Skincare and grooming", icon: "sparkles", hue: 300, populated: false,
    subcategories: [{ slug: "makeup", name: "Make-up" }, { slug: "fragrances", name: "Fragrances" }, { slug: "skin-care", name: "Skin care" }] },
  { slug: "toys", name: "Toys & Games", tagline: "Play for all ages", icon: "puzzle", hue: 45, populated: false, subcategories: [] },
  { slug: "baby-kids", name: "Baby & Kids", tagline: "Nursery to school", icon: "baby", hue: 195, populated: false, subcategories: [] },
  { slug: "automotive", name: "Automotive", tagline: "Vehicles, motorcycles and accessories", icon: "car", hue: 0, populated: false,
    subcategories: [{ slug: "vehicles", name: "Vehicles" }, { slug: "motorcycles", name: "Motorcycles" }] },
  { slug: "diy-tools", name: "DIY & Tools", tagline: "Power tools and hardware", icon: "wrench", hue: 40, populated: false, subcategories: [] },
  { slug: "garden", name: "Garden", tagline: "Plants, tools and outdoor living", icon: "flower", hue: 100, populated: false, subcategories: [] },
  { slug: "pets", name: "Pets", tagline: "Food and care", icon: "paw-print", hue: 30, populated: false, subcategories: [] },
  { slug: "books", name: "Books & Education", tagline: "Reading and learning", icon: "book-open", hue: 260, populated: false, subcategories: [] },
  { slug: "office", name: "Office", tagline: "Desk and stationery", icon: "briefcase", hue: 215, populated: false, subcategories: [] },
  { slug: "jewelry-watches", name: "Jewelry & Watches", tagline: "Timepieces and accessories", icon: "watch", hue: 50, populated: false,
    subcategories: [{ slug: "watches", name: "Watches" }, { slug: "jewellery", name: "Jewellery" }, { slug: "sunglasses", name: "Sunglasses" }] },
  { slug: "health", name: "Health & Wellness", tagline: "Everyday wellbeing products", icon: "heart-pulse", hue: 350, populated: false, subcategories: [] },
  { slug: "travel", name: "Travel Accessories", tagline: "Luggage and on-the-go", icon: "luggage", hue: 190, populated: false, subcategories: [] },
];

export function getDepartment(slug: string): Department | undefined {
  return departments.find((d) => d.slug === slug);
}
