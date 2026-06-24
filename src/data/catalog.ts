import source from './catalogo_productos.json';

export type Product = { internal_reference: string; name: string; sale_price: number };
export type Category = { slug: string; title: string; products_count: number; products: Product[] };
const rawCategories = source.categories as Category[];
export const categories = rawCategories.map((category) => {
  const seen = new Set<string>();
  const uniqueProducts = category.products.filter((product) => {
    const key = product.internal_reference;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...category, products: uniqueProducts, products_count: uniqueProducts.length };
});
export const catalog = { ...source, total_products: categories.reduce((sum, category) => sum + category.products_count, 0), categories };
export const products = categories.flatMap((category) => category.products.map((product) => ({ ...product, category })));
export const getCategory = (slug: string) => categories.find((category) => category.slug === slug);
export const getProduct = (categorySlug: string, reference: string) => products.find((product) => product.category.slug === categorySlug && product.internal_reference === reference);