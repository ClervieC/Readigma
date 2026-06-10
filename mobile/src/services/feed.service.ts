import api from './api';

export const feedService = {
  getFeed: () => api.get('/feed'),
};