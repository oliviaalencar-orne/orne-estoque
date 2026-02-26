/**
 * useCategories.js — Categories state + CRUD operations
 *
 * Extracted from index-legacy.html App component:
 *   - State: L2344
 *   - DEFAULT_CATEGORIES: L2377-2385
 *   - addCategory: L2764-2773
 *   - updateCategory: L2775-2779
 *   - deleteCategory: L2781-2785
 */
import { useState, useCallback } from 'react';
import { supabaseClient } from '@/config/supabase';
import { generateId } from '@/utils/helpers';

export const DEFAULT_CATEGORIES = [
  { id: 'abajur', name: 'Abajur', icon: 'catLamp', color: '#E8723A' },
  { id: 'arandelas', name: 'Arandelas', icon: 'catWallLight', color: '#A52428' },
  { id: 'pendentes', name: 'Pendentes', icon: 'catPendant', color: '#7B6EED' },
  { id: 'lustres', name: 'Lustres', icon: 'catChandelier', color: '#F4A261' },
  { id: 'plafons', name: 'Plafons', icon: 'catCeiling', color: '#D4612E' },
  { id: 'spots', name: 'Spots', icon: 'catSpot', color: '#2ECC87' },
  { id: 'outros', name: 'Outros', icon: 'catOther', color: '#7A7585' },
];

/**
 * Hook for categories state and CRUD.
 *
 * @param {boolean} isStockAdmin - Permission flag
 * @returns {Object}
 */
export function useCategories(isStockAdmin) {
  const [categories, setCategories] = useState([]);

  const addCategory = useCallback(
    async (category) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const newCategory = { ...category, id: category.id || generateId() };
      const { error } = await supabaseClient.from('categories').upsert({
        id: newCategory.id,
        name: newCategory.name,
        icon: newCategory.icon || '',
        color: newCategory.color || '',
      });
      if (error) {
        console.error('Erro ao adicionar categoria:', error);
        alert('Erro ao salvar categoria: ' + error.message);
        return;
      }
      return newCategory;
    },
    [isStockAdmin]
  );

  const updateCategory = useCallback(
    async (categoryId, data) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('categories').update(data).eq('id', categoryId);
      if (error) {
        console.error('Erro ao atualizar categoria:', error);
        alert('Erro ao atualizar categoria: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  const deleteCategory = useCallback(
    async (categoryId) => {
      if (!isStockAdmin) {
        alert('Sem permissão para esta ação');
        return;
      }
      const { error } = await supabaseClient.from('categories').delete().eq('id', categoryId);
      if (error) {
        console.error('Erro ao excluir categoria:', error);
        alert('Erro ao excluir categoria: ' + error.message);
      }
    },
    [isStockAdmin]
  );

  return {
    categories,
    setCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  };
}
