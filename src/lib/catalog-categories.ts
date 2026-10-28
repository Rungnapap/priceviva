/** Public taxonomy aliases. Stored/manual legacy categories are never rewritten here. */
export function catalogCategory(department?: string | null, subcategory?: string | null): { department: string; subcategory: string } {
  return department === "home" && subcategory === "furniture"
    ? { department: "furniture", subcategory: "" }
    : { department: department ?? "", subcategory: subcategory ?? "" };
}

export function categoryFilter(value: string): string {
  const [department, subcategory] = value.split("/");
  const category = catalogCategory(department, subcategory);
  return category.subcategory ? `${category.department}/${category.subcategory}` : category.department;
}

type SearchParams = Record<string, string | string[] | undefined>;
function query(params: SearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) result.append(key, item);
  }
  return result;
}
export function legacyDepartmentRedirect(slug: string, params: SearchParams): string | null {
  const search = query(params);
  if (slug !== "home" || search.get("sub") !== "furniture") return null;
  search.delete("sub");
  return `/departments/furniture${search.size ? `?${search}` : ""}`;
}
export function legacySearchRedirect(params: SearchParams): string | null {
  const search = query(params), previous = search.get("dept");
  if (previous !== "home/furniture") return null;
  search.set("dept", "furniture");
  return `/search?${search}`;
}
