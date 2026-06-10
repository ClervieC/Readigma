import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://readigma-backend.onrender.com/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('readigma_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;