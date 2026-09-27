import { api } from './client.js';

export const getHistory = (from, to) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return api.get(`/history${qs ? `?${qs}` : ''}`);
};
export const upsertHistoryEntry = (date, data) => api.put(`/history/${date}`, data);
export const deleteHistoryEntry = (date) => api.del(`/history/${date}`);
