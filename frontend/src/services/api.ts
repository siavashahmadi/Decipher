import axios from 'axios';
import { supabase } from './auth';
import type { PersonalBest, PuzzleType, Solve } from '../types';

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

export type PublicSolve = Omit<Solve, 'user_id'>;

const api = {
	// SD-2: cursor-based pagination. Pass cursor=null for the first page;
	// pass the returned next_cursor for the next. Optional `signal` lets
	// callers (e.g. useAllSolves's pagination loop) cancel in-flight
	// requests when the user navigates or switches puzzles mid-fetch.
	getSolves: async (
		puzzleType: PuzzleType,
		cursor: string | null = null,
		signal?: AbortSignal,
	): Promise<SolvesPage> => {
		const headers = await getAuthHeader();
		const params: { puzzle_type: PuzzleType; cursor?: string } = { puzzle_type: puzzleType };
		if (cursor) params.cursor = cursor;
		const response = await axios.get<SolvesPage>(`${API_URL}/solves`, { headers, params, signal });
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

	// Migrate guest solves in a single batch. The backend's POST
	// /solves/batch accepts up to 1000 rows in one transaction and
	// recomputes PBs server-side after the bulk insert, so we no longer
	// have to stay below the 30/min per-solve rate limit.
	migrateSolves: async (
		allGuestSolves: Solve[],
	): Promise<{ migrated: Solve[]; failed: Solve[]; errorStatus?: number }> => {
		if (allGuestSolves.length === 0) return { migrated: [], failed: [] };
		// Sort ascending so the server's PB recompute receives them in the
		// order they were earned. The batch endpoint also recomputes from
		// solves.created_at after insert, but sending sorted is harmless and
		// makes server-side ordering testable.
		const sorted = [...allGuestSolves].sort(
			(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);
		const payload = sorted.map(({ id: _id, user_id: _uid, created_at: _createdAt, ...rest }) => rest);
		try {
			const headers = await getAuthHeader();
			const response = await axios.post<{ solves: Solve[] }>(
				`${API_URL}/solves/batch`,
				{ solves: payload },
				{ headers },
			);
			return { migrated: response.data.solves, failed: [] };
		} catch (err) {
			console.error('Failed to migrate guest solves:', err);
			// Surface the HTTP status so callers can pick a useful toast
			// (429 vs 422 vs 500). Atomic batch -> all-or-nothing failure.
			const status = axios.isAxiosError(err) ? err.response?.status : undefined;
			return { migrated: [], failed: sorted, errorStatus: status };
		}
	},
};

export default api;
