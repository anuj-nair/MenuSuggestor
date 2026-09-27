import { api } from './client.js';

export const getMeals = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return api.get(`/meals${qs ? `?${qs}` : ''}`);
};
export const getMeal = (id) => api.get(`/meals/${id}`);
export const createMeal = (data) => api.post('/meals', data);
export const updateMeal = (id, data) => api.put(`/meals/${id}`, data);
export const deleteMeal = (id) => api.del(`/meals/${id}`);
export const getCuisines = () => api.get('/cuisines');
export const getMealTypes = () => api.get('/meal-types');
