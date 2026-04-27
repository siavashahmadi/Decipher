import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PuzzleType } from '../types';

export interface ReplayState {
  scramble?: string;
  puzzle?: PuzzleType;
}

export function useReplayState(): ReplayState {
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState<ReplayState>(() => {
    const s = location.state as { replayScramble?: string; replayPuzzle?: PuzzleType } | null;
    return { scramble: s?.replayScramble, puzzle: s?.replayPuzzle };
  });
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  return initial;
}
