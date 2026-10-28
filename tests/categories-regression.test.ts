import { test } from "node:test";
import assert from "node:assert/strict";
import { guessDepartment } from "../src/lib/importers/categories";
import { departments } from "../src/data/departments";

const missing = [
  ["Phone accessories", "phones", "accessories"],
  ["Surfplatta", "computers-gaming", "tablets"],
  ["Köksredskap", "kitchen", "kitchen-accessories"],
  ["Möbler", "furniture", null],
  ["Home decor", "home", "decor"],
  ["Fotboll", "sports", "sports-accessories"],
  ["Men's clothing", "fashion", "mens"],
  ["Women's clothing", "fashion", "womens"],
  ["Shoes", "shoes-bags", "shoes"],
  ["Handbag", "shoes-bags", "bags"],
  ["Smink", "beauty", "makeup"],
  ["Parfym", "beauty", "fragrances"],
  ["Hudvård", "beauty", "skin-care"],
  ["Vehicles", "automotive", "vehicles"],
  ["Motorcykel", "automotive", "motorcycles"],
  ["Watch", "jewelry-watches", "watches"],
  ["Smycken", "jewelry-watches", "jewellery"],
  ["Solglasögon", "jewelry-watches", "sunglasses"],
] as const;
for (const [title, department, subcategory] of missing) {
  test(`previously missing automatic subcategory: ${department}/${subcategory}`, () => {
    assert.deepEqual(guessDepartment(null, title, "new"), { department, subcategory });
    assert.deepEqual(guessDepartment(`Shop > ${title}`, "Unspecified product", "new"), { department, subcategory });
    const d = departments.find(d => d.slug === department);
    assert.ok(d);
    if (subcategory) assert.ok(d.subcategories.some(s => s.slug === subcategory));
  });
}

const cases = [
  ["Kitchen > Blenders", "W7 Face Blender makeup brush", "beauty", "makeup"],
  ["Kitchen > Blenders", "EcoTools Perfecting Blender Duo", "beauty", "makeup"],
  ["Home > Beauty", "Nivea Soft Moisturising Pot Cream 200ml", "beauty", "skin-care"],
  ["Kitchen > Appliances", "Kitchen blender", "kitchen", "small-appliances"],
  [null, "Magefesa meat grinder", "kitchen", "small-appliances"],
  [null, "Mikrovågsugn", "kitchen", "small-appliances"],
  ["Pets > Food", "Pet food", "pets", null],
  ["Garden > Tools", "Garden tools", "garden", null],
  [null, "Kids clothing", "baby-kids", null],
  [null, "Barnstrumpor", "baby-kids", null],
  [null, "Ullstrumpor", "fashion", null],
  [null, "Sneakersockor", "fashion", null],
  ["Home > Lighting", "Ceiling lamp", "home", "lighting"],
  ["Home > Food > Coffee Beans", "Coffee beans", "groceries", "drinks"],
  [null, "Vitamin capsules", "health", null],
  [null, "Dishwasher tablets", "groceries", "cleaning"],
  [null, "Electrical socket", null, null],
  [null, "Mystery object ZX-37", null, null],
  [null, "Sports watch", "sports", "wearables"],
] as const;
for (const [path, title, department, subcategory] of cases) {
  test(`category collision regression: ${title}`, () => {
    assert.deepEqual(guessDepartment(path, title, "new"), { department, subcategory });
  });
}

test("non-new products retain the existing refurbished department policy", () => {
  for (const condition of ["used", "refurbished", "open_box"]) {
    assert.deepEqual(guessDepartment(null, "Mobiltelefon", condition), { department: "refurbished", subcategory: "refurb-phones" });
    assert.deepEqual(guessDepartment(null, "Laptop", condition), { department: "refurbished", subcategory: "refurb-computers" });
    assert.deepEqual(guessDepartment(null, "Garden tools", condition), { department: "refurbished", subcategory: null });
  }
});

test("combined department headings do not select an arbitrary subcategory", () => {
  for (const [path, title, department, subcategory] of [
    ["Phones & Accessories", "Screen protector", "phones", "cases"],
    ["Computers & Gaming", "Laptop", "computers-gaming", "laptops"],
    ["Sports & Fitness", "Sports watch", "sports", "wearables"],
    ["Shoes & Bags", "Shoe", "shoes-bags", "shoes"],
    ["Jewelry and Watches", "Watch", "jewelry-watches", "watches"],
  ] as const) {
    assert.deepEqual(guessDepartment(path, title, "new"), { department, subcategory });
    assert.deepEqual(guessDepartment(path, "Unspecified item", "new"), { department, subcategory: null });
  }
});
