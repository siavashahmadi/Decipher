import axios from 'axios';
import { supabase } from './auth';

const API_URL = 'http://localhost:5000/api';

const getAuthHeader = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? {
    Authorization: `Bearer ${session.access_token}`
  } : {}
}

const api = {
  // Solve related endpoints
  getSolves: async (puzzleType) => {
    const headers = await getAuthHeader()
    console.log('Auth headers:', headers)
    const response = await axios.get(`${API_URL}/solves`, {
      headers,
      params: { puzzle_type: puzzleType }
    });
    return response.data;
  },

  createSolve: async (solveData) => {
    const headers = await getAuthHeader()
    const response = await axios.post(`${API_URL}/solves`, solveData, { headers });
    return response.data;
  },

  updateSolve: async (solveId, updateData) => {
    const headers = await getAuthHeader()
    const response = await axios.patch(`${API_URL}/solves/${solveId}`, updateData, { headers });
    return response.data;
  },

  deleteSolve: async (solveId) => {
    const headers = await getAuthHeader()
    const response = await axios.delete(`${API_URL}/solves/${solveId}`, { headers });
    return response.data;
  }
};

export default api;