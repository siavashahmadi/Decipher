import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import api from './api';
import type { Solve } from '../types';
import { makeSolve } from '../test-utils/makeSolve';

vi.mock('axios');
vi.mock('./auth', () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

const mkSolve = (id: string, created_at: string, time: number): Solve =>
  makeSolve({ id, user_id: 'u', created_at, time });

describe('api.migrateSolves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { solves: [] },
    });
  });

  it('sends all solves in a single POST /solves/batch request', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    const input = [
      mkSolve('c', '2026-04-25T12:00:00Z', 30),
      mkSolve('a', '2026-04-25T08:00:00Z', 10),
      mkSolve('b', '2026-04-25T10:00:00Z', 20),
    ];
    await api.migrateSolves(input);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toMatch(/\/solves\/batch$/);
  });

  it('posts solves in ascending created_at order inside the batch body', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    const input = [
      mkSolve('c', '2026-04-25T12:00:00Z', 30),
      mkSolve('a', '2026-04-25T08:00:00Z', 10),
      mkSolve('b', '2026-04-25T10:00:00Z', 20),
    ];
    await api.migrateSolves(input);
    const body = post.mock.calls[0]![1] as { solves: { time: number }[] };
    expect(body.solves.map((s) => s.time)).toEqual([10, 20, 30]);
  });

  it('does not mutate the input array', async () => {
    const input = [
      mkSolve('c', '2026-04-25T12:00:00Z', 30),
      mkSolve('a', '2026-04-25T08:00:00Z', 10),
    ];
    const snapshot = input.map((s) => s.id);
    await api.migrateSolves(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });

  it('preserves order on equal timestamps (stable sort)', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    const ts = '2026-04-25T08:00:00Z';
    const input = [mkSolve('first', ts, 1), mkSolve('second', ts, 2)];
    await api.migrateSolves(input);
    const body = post.mock.calls[0]![1] as { solves: { time: number }[] };
    expect(body.solves.map((s) => s.time)).toEqual([1, 2]);
  });

  it('returns the inserted solves on success', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockResolvedValue({ data: { solves: [mkSolve('s1', '2026-04-25T08:00:00Z', 10)] } });
    const result = await api.migrateSolves([mkSolve('a', '2026-04-25T08:00:00Z', 10)]);
    expect(result.migrated).toHaveLength(1);
    expect(result.failed).toEqual([]);
  });

  it('returns input as failed on POST error', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockRejectedValue(new Error('429'));
    const input = [mkSolve('a', '2026-04-25T08:00:00Z', 10)];
    const { migrated, failed } = await api.migrateSolves(input);
    expect(migrated).toEqual([]);
    expect(failed.map((s) => s.id)).toEqual(['a']);
  });

  it('returns empty result for empty input without making any HTTP call', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    const result = await api.migrateSolves([]);
    expect(result).toEqual({ migrated: [], failed: [] });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('api.migrateSolves errorStatus capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.isAxiosError as unknown as ReturnType<typeof vi.fn>) = vi.fn(
      (e: unknown): e is { response?: { status?: number } } =>
        typeof e === 'object' && e !== null && 'response' in e,
    );
  });

  const axiosError = (status: number) => ({
    isAxiosError: true,
    response: { status },
    message: `request failed with ${status}`,
  });

  it('captures HTTP 429 in result.errorStatus on rate-limit rejection', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockRejectedValue(axiosError(429));
    const input = [
      { id: 'a', user_id: 'u', puzzle_type: '333' as const, time: 9, scramble: '',
        dnf: false, plus_two: false, created_at: '2026-04-25T08:00:00Z' },
    ];
    const result = await api.migrateSolves(input);
    expect(result.errorStatus).toBe(429);
    expect(result.migrated).toEqual([]);
    expect(result.failed.map(s => s.id)).toEqual(['a']);
  });

  it('captures HTTP 422 in result.errorStatus on validation rejection', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockRejectedValue(axiosError(422));
    const input = [
      { id: 'a', user_id: 'u', puzzle_type: '333' as const, time: 9, scramble: '',
        dnf: false, plus_two: false, created_at: '2026-04-25T08:00:00Z' },
    ];
    const { errorStatus } = await api.migrateSolves(input);
    expect(errorStatus).toBe(422);
  });

  it('captures HTTP 500 in result.errorStatus on server error', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockRejectedValue(axiosError(500));
    const input = [
      { id: 'a', user_id: 'u', puzzle_type: '333' as const, time: 9, scramble: '',
        dnf: false, plus_two: false, created_at: '2026-04-25T08:00:00Z' },
    ];
    const { errorStatus } = await api.migrateSolves(input);
    expect(errorStatus).toBe(500);
  });

  it('leaves errorStatus undefined when the failure is not an axios error', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockRejectedValue(new Error('plain network failure'));
    const input = [
      { id: 'a', user_id: 'u', puzzle_type: '333' as const, time: 9, scramble: '',
        dnf: false, plus_two: false, created_at: '2026-04-25T08:00:00Z' },
    ];
    const { errorStatus } = await api.migrateSolves(input);
    expect(errorStatus).toBeUndefined();
  });
});

describe('api.getSolves AbortSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the provided AbortSignal through to axios', async () => {
    const get = axios.get as unknown as ReturnType<typeof vi.fn>;
    get.mockResolvedValue({ data: { solves: [], next_cursor: null } });
    const controller = new AbortController();

    await api.getSolves('333', null, controller.signal);

    expect(get).toHaveBeenCalledTimes(1);
    const opts = get.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });

  it('omits signal from axios options when none is provided', async () => {
    const get = axios.get as unknown as ReturnType<typeof vi.fn>;
    get.mockResolvedValue({ data: { solves: [], next_cursor: null } });

    await api.getSolves('333');

    const opts = get.mock.calls[0]![1] as { signal?: AbortSignal };
    expect(opts.signal).toBeUndefined();
  });
});
