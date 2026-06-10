import api from './api';

export const friendsService = {
  searchUsers: (q: string) => api.get(`/users/search?q=${q}`),
  sendRequest: (receiver_id: string) => api.post('/friends/request', { receiver_id }),
  getFriends: () => api.get('/friends'),
  getPendingRequests: () => api.get('/friends/pending'),
  acceptRequest: (id: string) => api.put(`/friends/request/${id}/accept`),
};