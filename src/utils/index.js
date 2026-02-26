/**
 * utils/index.js — Barrel export for all utilities
 */
export { mapProductFromDB, mapEntryFromDB, mapExitFromDB, mapShippingFromDB } from './mappers';
export { formatBRL, parseBRL } from './formatters';
export { normalizeNfKey, getEstoquePorNF } from './fifo';
export { generateId, handleTinyCallback } from './helpers';
export {
  ICONS,
  Icon,
  CATEGORY_ICON_OPTIONS,
  UNICODE_TO_SVG,
  resolveCatIcon,
  CategoryIcon,
} from './icons';
