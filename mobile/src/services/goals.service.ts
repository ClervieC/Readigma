import api from './api';

export const goalsService = {
  setGoal: (target_books: number, year?: number) =>
    api.post('/goals', { target_books, year: year || new Date().getFullYear() }),

  getGoal: (year?: number) =>
    api.get(`/goals/${year || new Date().getFullYear()}`),

  getMonthly: (year?: number) =>
    api.get(`/goals/${year || new Date().getFullYear()}/monthly`),
};