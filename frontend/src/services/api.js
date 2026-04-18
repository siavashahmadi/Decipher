import axios from 'axios';
import { supabase } from './auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const getAuthHeader = async () => {
	const { data: { session } } = await supabase.auth.getSession()
	return session?.access_token ? {
		Authorization: `Bearer ${session.access_token}`
	} : {}
}

const api = {
	// SD-2: Returns { solves, nextCursor } for cursor-based pagination.
	// Pass cursor=null for the first page; pass the returned nextCursor for the next.
	getSolves: async (puzzleType, cursor = null) => {
		const headers = await getAuthHeader()
		const params = { puzzle_type: puzzleType }
		if (cursor) params.cursor = cursor
		const response = await axios.get(`${API_URL}/solves`, { headers, params });
		return response.data; // { solves: [...], next_cursor: "..." | null }
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
	},

	// SD-3: Personal best history for progression chart
	getPersonalBests: async (puzzleType) => {
		const headers = await getAuthHeader()
		const response = await axios.get(`${API_URL}/personal-bests`, {
			headers,
			params: { puzzle_type: puzzleType }
		});
		return response.data;
	},

	// Migrate guest solves to server after signup. Sequential to stay within
	// the 30/min rate limit and preserve PB materialization order.
	migrateSolves: async (allGuestSolves) => {
		for (const solve of allGuestSolves) {
			const { id: _localId, user_id: _uid, ...payload } = solve;
			try {
				await api.createSolve(payload);
			} catch (err) {
				console.error('Failed to migrate guest solve:', solve.id, err);
			}
		}
	},
};

export default api;
