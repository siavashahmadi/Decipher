import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import api from './api';
import type { Solve } from '../types';

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

const mkSolve = (id: string, created_at: string, time: number): Solve => ({
  id,
  user_id: 'u',
  puzzle_type: '333',
  time,
  scramble: '',
  dnf: false,
  plus_two: false,
  created_at,
});

describe('api.migrateSolves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (axios.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {},
    });
  });

  it('posts solves in ascending created_at order', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    // Times encode the desired sorted order so we can read it back from
    // axios.post's call history. Input is intentionally not pre-sorted.
    const input = [
      mkSolve('c', '2026-04-25T12:00:00Z', 30),
      mkSolve('a', '2026-04-25T08:00:00Z', 10),
      mkSolve('b', '2026-04-25T10:00:00Z', 20),
    ];
    await api.migrateSolves(input);

    expect(post).toHaveBeenCalledTimes(3);
    const sentTimes = post.mock.calls.map((c) => (c[1] as { time: number }).time);
    expect(sentTimes).toEqual([10, 20, 30]);
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
    const sentTimes = post.mock.calls.map((c) => (c[1] as { time: number }).time);
    expect(sentTimes).toEqual([1, 2]);
  });

  it('continues iterating on per-solve failure and partitions results', async () => {
    const post = axios.post as unknown as ReturnType<typeof vi.fn>;
    post.mockReset();
    post
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValueOnce({ data: {} });
    const input = [
      mkSolve('a', '2026-04-25T08:00:00Z', 10),
      mkSolve('b', '2026-04-25T09:00:00Z', 20),
      mkSolve('c', '2026-04-25T10:00:00Z', 30),
    ];
    const { migrated, failed } = await api.migrateSolves(input);
    expect(migrated.map((s) => s.id)).toEqual(['a', 'c']);
    expect(failed.map((s) => s.id)).toEqual(['b']);
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
    const opts = get.mock.calls[0][1] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });

  it('omits signal from axios options when none is provided', async () => {
    const get = axios.get as unknown as ReturnType<typeof vi.fn>;
    get.mockResolvedValue({ data: { solves: [], next_cursor: null } });

    await api.getSolves('333');

    const opts = get.mock.calls[0][1] as { signal?: AbortSignal };
    expect(opts.signal).toBeUndefined();
  });
});
