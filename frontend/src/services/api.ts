import axios from 'axios';
import { supabase } from './auth';
import type { PuzzleType, Solve, PersonalBest } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

type AuthHeader = { Authorization: string } | Record<string, never>;

const getAuthHeader = async (): Promise<AuthHeader> => {
	const { data: { session } } = await supabase.auth.getSession();
	return session?.access_token
		? { Authorization: `Bearer ${session.access_token}` }
		: {};
};

export interface SolvesPage {
	solves: Solve[];
	next_cursor: string | null;
}

export type SolvePayload = Omit<Solve, 'id' | 'user_id' | 'created_at'>;

export interface PublicSolve {
	id: string;
	puzzle_type: PuzzleType;
	time: number;
	dnf: boolean;
	plus_two: boolean;
	scramble: string;
	created_at: string;
}

const api = {
	// SD-2: cursor-based pagination. Pass cursor=null for the first page;
	// pass the returned next_cursor for the next.
	getSolves: async (puzzleType: PuzzleType, cursor: string | null = null): Promise<SolvesPage> => {
		const headers = await getAuthHeader();
		const params: { puzzle_type: PuzzleType; cursor?: string } = { puzzle_type: puzzleType };
		if (cursor) params.cursor = cursor;
		const response = await axios.get<SolvesPage>(`${API_URL}/solves`, { headers, params });
		return response.data;
	},

	createSolve: async (solveData: SolvePayload): Promise<Solve> => {
		const headers = await getAuthHeader();
		const response = await axios.post<Solve>(`${API_URL}/solves`, solveData, { headers });
		return response.data;
	},

	updateSolve: async (solveId: string, updateData: Partial<Solve>): Promise<Solve> => {
		const headers = await getAuthHeader();
		const response = await axios.patch<Solve>(`${API_URL}/solves/${solveId}`, updateData, { headers });
		return response.data;
	},

	deleteSolve: async (solveId: string): Promise<void> => {
		const headers = await getAuthHeader();
		await axios.delete(`${API_URL}/solves/${solveId}`, { headers });
	},

	// SD-3: personal best history for the progression chart.
	getPersonalBests: async (puzzleType: PuzzleType): Promise<PersonalBest[]> => {
		const headers = await getAuthHeader();
		const response = await axios.get<PersonalBest[]>(`${API_URL}/personal-bests`, {
			headers,
			params: { puzzle_type: puzzleType },
		});
		return response.data;
	},

	getShareToken: async (solveId: string): Promise<string> => {
		const headers = await getAuthHeader();
		const response = await axios.get<{ token: string }>(
			`${API_URL}/solves/${solveId}/share-token`,
			{ headers },
		);
		return response.data.token;
	},

	getSharedSolve: async (token: string): Promise<PublicSolve> => {
		const response = await axios.get<PublicSolve>(
			`${API_URL}/solves/share/${encodeURIComponent(token)}`,
		);
		return response.data;
	},

	// Migrate guest solves to server after signup. Sequential to stay within
	// the 30/min rate limit. Sort by created_at ascending so server-side PB
	// materialization sees solves in the order they were earned, not in
	// localStorage manifest order.
	migrateSolves: async (allGuestSolves: Solve[]): Promise<{ migrated: Solve[]; failed: Solve[] }> => {
		const migrated: Solve[] = [];
		const failed: Solve[] = [];
		const sorted = [...allGuestSolves].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);
		for (const solve of sorted) {
			const { id: _localId, user_id: _uid, created_at: _createdAt, ...payload } = solve;
			try {
				await api.createSolve(payload);
				migrated.push(solve);
			} catch (err) {
				// Silent at this layer: the caller (AuthContext) inspects the
				// returned `failed` array and surfaces a single aggregate toast.
				failed.push(solve);
				console.error('Failed to migrate guest solve:', solve.id, err);
			}
		}
		return { migrated, failed };
	},
};

export default api;
