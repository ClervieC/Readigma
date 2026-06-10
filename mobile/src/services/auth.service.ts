import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export const authService = {
  async register(username: string, email: string, password: string) {
    const res = await api.post('/auth/register', { username, email, password });
    await AsyncStorage.setItem('readigma_token', res.data.token);
    await AsyncStorage.setItem('readigma_user', JSON.stringify(res.data.user));
    return res.data;
  },

  async login(email: string, password: string) {
  try {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('readigma_token', res.data.token);
    await AsyncStorage.setItem('readigma_user', JSON.stringify(res.data.user));
    return res.data;
  } catch (err: any) {
    console.log('Login error:', JSON.stringify(err.response?.data));
    console.log('Login error status:', err.response?.status);
    console.log('Login error message:', err.message);
    throw err;
  }
},

  async logout() {
    await AsyncStorage.removeItem('readigma_token');
    await AsyncStorage.removeItem('readigma_user');
  },

  async getUser() {
    const user = await AsyncStorage.getItem('readigma_user');
    return user ? JSON.parse(user) : null;
  },

  async isLoggedIn() {
    const token = await AsyncStorage.getItem('readigma_token');
    return !!token;
  },

  async updateProfile(data: { username?: string; email?: string; password?: string; avatar_url?: string }) {
    const res = await api.put('/auth/profile', data);
    const current = await AsyncStorage.getItem('readigma_user');
    const merged = { ...(current ? JSON.parse(current) : {}), ...res.data };
    await AsyncStorage.setItem('readigma_user', JSON.stringify(merged));
    return res.data;
  },

  async savePushToken(token: string) {
    return api.put('/auth/push-token', { token });
  },
};