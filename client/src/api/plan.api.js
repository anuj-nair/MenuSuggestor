import { api } from './client.js';

export const getPlan = (start) => api.get(`/plan${start ? `?start=${start}` : ''}`);
export const generatePlan = (data) => api.post('/plan/generate', data);
export const refreshDay = (date, force = false) => api.post(`/plan/${date}/refresh`, { force });
