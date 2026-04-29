import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import TrainerSession from './TrainerSession';
import * as trainerScramble from '../../utils/trainerScramble';

// Stub Timer so we don't drag in audio / RAF / settings context.
vi.mock('../Timer', () => ({
  default: () => null,
}));
vi.mock('../Scramble', () => ({
  default: () => null,
}));
vi.mock('../ScramblePreview', () => ({
  default: () => null,
}));
vi.mock('./TrainerCasePicker', () => ({
  default: () => null,
  ALL_CASES: { kind: 'all' as const },
  caseChoiceToValue: (choice: { kind: 'all' } | { kind: 'id'; id: string }) =>
    choice.kind === 'all' ? 'all' : choice.id,
  caseChoiceFromValue: (value: string) =>
    value === 'all' ? { kind: 'all' as const } : { kind: 'id' as const, id: value },
}));
vi.mock('./TrainerRecentStrip', () => ({
  default: () => null,
}));

describe('TrainerSession scramble generation', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('generates exactly one scramble on initial mount', () => {
    const spy = vi.spyOn(trainerScramble, 'generateTrainerScramble');
    render(<TrainerSession type="pll" />);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('generates exactly one scramble on type change (no double-fire)', () => {
    const spy = vi.spyOn(trainerScramble, 'generateTrainerScramble');
    const { rerender } = render(<TrainerSession type="pll" />);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();

    act(() => {
      rerender(<TrainerSession type="oll" />);
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
