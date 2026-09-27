import { api } from './client.js';

export const getIngredients = () => api.get('/ingredients');
export const createIngredient = (data) => api.post('/ingredients', data);
export const updateIngredient = (id, data) => api.put(`/ingredients/${id}`, data);
export const getUnits = () => api.get('/ingredients/units');
export const getIngredientTags = () => api.get('/ingredients/tags');
