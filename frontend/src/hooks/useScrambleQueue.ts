import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrambleQueue, ScrambleQueueSnapshot } from '../lib/scrambleQueue';
import type { PuzzleType } from '../types';

export interface UseScrambleQueueResult {
  currentScramble: string | null;
  loading: boolean;
  advance: () => void;
}

export interface UseScrambleQueueOptions {
  initialScramble?: string;
}

const useScrambleQueue = (
  puzzleType: PuzzleType,
  options?: UseScrambleQueueOptions,
): UseScrambleQueueResult => {
  const queueRef = useRef<ScrambleQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new ScrambleQueue(puzzleType, options?.initialScramble);
  }

  const [snap, setSnap] = useState<ScrambleQueueSnapshot>(() => queueRef.current!.snapshot());

  useEffect(() => {
    const queue = queueRef.current!;
    const unsub = queue.subscribe(setSnap);
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    queueRef.current!.setPuzzleType(puzzleType);
  }, [puzzleType]);

  const advance = useCallback(() => {
    queueRef.current!.advance();
  }, []);

  return {
    currentScramble: snap.currentScramble,
    loading: snap.currentScramble === null,
    advance,
  };
};

export default useScrambleQueue;
