/**
 * hooks/index.js — Barrel export for all hooks
 */
export { setupSupabaseCollection, fetchAllRows } from './useSupabaseCollection';
export { useAuth } from './useAuth';
export { useStock } from './useStock';
export { useProducts } from './useProducts';
export { useEntries } from './useEntries';
export { useExits } from './useExits';
export { useShippings } from './useShippings';
export { useSeparations } from './useSeparations';
export { useCategories, DEFAULT_CATEGORIES } from './useCategories';
export { useLocaisOrigem } from './useLocaisOrigem';
