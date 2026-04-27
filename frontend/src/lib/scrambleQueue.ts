import { randomScrambleForEvent } from 'cubing/scramble';
import type { PuzzleType } from '../types';

export interface ScrambleQueueSnapshot {
  currentScramble: string | null;
}

type Listener = (snap: ScrambleQueueSnapshot) => void;

export class ScrambleQueue {
  private current: string | null = null;
  private next: string | null = null;
  private generationId = 0;
  private listeners = new Set<Listener>();
  private puzzleType: PuzzleType;

  constructor(puzzleType: PuzzleType, initialScramble?: string) {
    this.puzzleType = puzzleType;
    if (initialScramble) {
      this.current = initialScramble;
      this.generationId += 1;
      void this.fillNext(this.generationId);
    } else {
      this.refill();
    }
  }

  setPuzzleType(puzzleType: PuzzleType): void {
    if (puzzleType === this.puzzleType) return;
    this.puzzleType = puzzleType;
    this.current = null;
    this.next = null;
    this.emit();
    this.refill();
  }

  advance(): void {
    this.current = this.next;
    this.next = null;
    this.emit();
    void this.fillNext(this.generationId);
  }

  snapshot(): ScrambleQueueSnapshot {
    return { currentScramble: this.current };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    this.listeners.forEach(fn => fn(snap));
  }

  private async refill(): Promise<void> {
    this.generationId += 1;
    const myGen = this.generationId;
    const [a, b] = await Promise.all([this.gen(), this.gen()]);
    if (myGen !== this.generationId) return;
    this.current = a;
    this.next = b;
    this.emit();
  }

  private async fillNext(gen: number): Promise<void> {
    const scramble = await this.gen();
    if (gen !== this.generationId) return;
    this.next = scramble;
    this.emit();
  }

  private async gen(): Promise<string> {
    const obj = await randomScrambleForEvent(this.puzzleType);
    return obj.toString();
  }
}
