/**
 * Shopper-facing category groups used in the header bar, homepage tiles and /shop/[slug] pages.
 * Each group combines one or more catalogue departments (src/data/departments.ts), so e.g.
 * "Electronics" shows TVs and audio, phones and computers together.
 *
 * Photos: see public/images/site/CREDITS.md. To replace one, drop a new file in
 * public/images/site/ and change `image` here (docs/REPLACE_IMAGES.md).
 */
export interface ShopCategory {
  slug: string;
  name: string;
  /** Short text under the name on the group page. */
  blurb: string;
  departments: string[];
  image: string;
  imageAlt: string;
  /** CSS object-position keeping the main subject in view when the card crops the photo. */
  imagePosition?: string;
  /** Pixel size of the photo (for the category page header). */
  imageSize?: [number, number];
  /** Shown as a large photo card on the homepage (the 12 main categories). */
  featured: boolean;
}

/**
 * Photos marked "v7" are the owner-supplied photorealistic category images (v0.7).
 * Beauty & Personal Care has no v0.7 photo yet, so it uses the owner-supplied v0.5 handbag/perfume photo.
 * Pets keeps its earlier licensed tile photo (see CREDITS.md).
 */
export const shopCategories: ShopCategory[] = [
  {
    slug: "fashion",
    name: "Fashion",
    blurb: "Clothing, shoes, bags, watches and accessories",
    departments: ["fashion", "shoes-bags", "jewelry-watches"],
    image: "/images/site/cat-fashion-v7.webp",
    imageSize: [1536, 1024],
    imageAlt: "A shopper in a camel blazer carrying shopping bags in a bright fashion boutique",
    imagePosition: "62% 30%",
    featured: true,
  },
  {
    slug: "beauty",
    name: "Beauty & Personal Care",
    blurb: "Make-up, fragrances and skin care",
    departments: ["beauty"],
    image: "/images/site/bg-fashion-beauty-mobile.webp",
    imageAlt: "A cream handbag, silk scarf, sunglasses and a perfume bottle on a marble counter",
    imagePosition: "50% 60%",
    featured: true,
  },
  {
    slug: "home-living",
    name: "Home & Living",
    blurb: "Furniture, lighting, textiles and decor",
    departments: ["home"],
    image: "/images/site/cat-home-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A sunlit living room with a cream sofa, cushions, a marble coffee table and flowers",
    imagePosition: "55% 60%",
    featured: true,
  },
  {
    slug: "electronics",
    name: "Electronics",
    blurb: "Phones, computers, audio, TVs and smart home",
    departments: ["electronics", "phones", "computers-gaming"],
    image: "/images/site/cat-electronics-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A laptop, over-ear headphones, a camera, a smartphone and a smartwatch on a marble desk",
    imagePosition: "50% 55%",
    featured: true,
  },
  {
    slug: "sports-outdoor",
    name: "Sports & Outdoor",
    blurb: "Fitness, running, hiking, camping and cycling",
    departments: ["sports", "outdoors"],
    image: "/images/site/cat-sports-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "Hiking shoes, a backpack, a water bottle, binoculars and a map by a mountain lake",
    imagePosition: "35% 60%",
    featured: true,
  },
  {
    slug: "kids-baby",
    name: "Kids & Baby",
    blurb: "Toys, games, nursery and kids' essentials",
    departments: ["baby-kids", "toys"],
    image: "/images/site/cat-kids-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A sunny nursery with a teddy bear, wooden toys, a baby bottle and a cot",
    imagePosition: "40% 65%",
    featured: true,
  },
  {
    slug: "food-grocery",
    name: "Food & Grocery",
    blurb: "Fresh food, pantry, drinks and household essentials",
    departments: ["groceries"],
    image: "/images/site/cat-grocery-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "Fresh vegetables, fruit, bread, cheese and pantry jars on a kitchen table",
    imagePosition: "40% 55%",
    featured: true,
  },
  {
    slug: "health-care",
    name: "Health & Wellness",
    blurb: "Fitness at home, supplements and everyday wellbeing",
    departments: ["health"],
    image: "/images/site/cat-health-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A yoga mat, dumbbells, a water bottle, fruit and supplement jars on a wooden table",
    imagePosition: "45% 60%",
    featured: true,
  },
  {
    slug: "car-diy",
    name: "Cars & DIY",
    blurb: "Car accessories, tools and hardware",
    departments: ["automotive", "diy-tools"],
    image: "/images/site/cat-cars-diy-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A garage with tyres, a toolbox, a cordless drill and a car with its boot open",
    imagePosition: "40% 60%",
    featured: true,
  },
  {
    slug: "travel-luggage",
    name: "Travel & Luggage",
    blurb: "Suitcases, bags and travel accessories",
    departments: ["travel"],
    image: "/images/site/cat-travel-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A suitcase, travel bags, a camera and sunglasses in a sunlit airport departure hall",
    imagePosition: "45% 60%",
    featured: true,
  },
  {
    slug: "kitchen-appliances",
    name: "Kitchen & Appliances",
    blurb: "Coffee machines, cookware and small appliances",
    departments: ["kitchen"],
    image: "/images/site/cat-kitchen-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "An espresso machine, air fryer, blender, stand mixer and pans on a kitchen counter",
    imagePosition: "50% 55%",
    featured: true,
  },
  {
    slug: "garden-outdoor",
    name: "Garden & Outdoor Living",
    blurb: "Garden tools, plants, outdoor furniture and barbecues",
    departments: ["garden"],
    image: "/images/site/cat-garden-v7.webp",
    imageSize: [1672, 941],
    imageAlt: "A sunny patio with potted plants, garden tools, a lawn mower, a parasol and a barbecue",
    imagePosition: "50% 60%",
    featured: true,
  },
  {
    slug: "pets",
    name: "Pets",
    blurb: "Food, care and accessories for pets",
    departments: ["pets"],
    image: "/images/site/cat-pets.webp",
    imageAlt: "A cat and a dog lying together on the grass",
    featured: false,
  },
];

export const getShopCategory = (slug: string) => shopCategories.find((c) => c.slug === slug);

/** Which group a department belongs to (first match), for breadcrumbs. */
export const groupForDepartment = (dept: string) => shopCategories.find((c) => c.departments.includes(dept));
