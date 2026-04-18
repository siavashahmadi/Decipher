import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrambleQueue, ScrambleQueueSnapshot } from '../lib/scrambleQueue';
import type { PuzzleType } from '../types';

export interface UseScrambleQueueResult {
  currentScramble: string | null;
  nextScramble: string | null;
  loading: boolean;
  advance: () => void;
}

const useScrambleQueue = (puzzleType: PuzzleType): UseScrambleQueueResult => {
  const queueRef = useRef<ScrambleQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new ScrambleQueue(puzzleType);
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
    nextScramble: snap.nextScramble,
    loading: snap.currentScramble === null,
    advance,
  };
};

export default useScrambleQueue;
