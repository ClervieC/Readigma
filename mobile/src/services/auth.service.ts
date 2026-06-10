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
  }
};