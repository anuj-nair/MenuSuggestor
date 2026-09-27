import { api } from './client.js';

export const getMealIngredients = (mealId) => api.get(`/meals/${mealId}/ingredients`);
export const linkIngredient = (mealId, data) => api.post(`/meals/${mealId}/ingredients`, data);
export const updateMealIngredient = (mealId, ingredientId, data) =>
  api.put(`/meals/${mealId}/ingredients/${ingredientId}`, data);
export const unlinkIngredient = (mealId, ingredientId) =>
  api.del(`/meals/${mealId}/ingredients/${ingredientId}`);
