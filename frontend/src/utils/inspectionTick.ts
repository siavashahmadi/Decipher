import {
  INSPECTION_LIMIT_MS,
  INSPECTION_PLUS_TWO_MS,
  INSPECTION_8S_WARNING_AT_MS,
  INSPECTION_12S_WARNING_AT_MS,
} from './inspectionConstants';

export type TickResult =
  | { kind: 'expired' }
  | { kind: 'plus_two'; remainingSecond: number }
  | { kind: 'continue'; remainingSecond: number; warning: 8 | 12 | null };

const WARNING_8_REMAINING = Math.ceil((INSPECTION_LIMIT_MS - INSPECTION_8S_WARNING_AT_MS) / 1000);
const WARNING_12_REMAINING = Math.ceil((INSPECTION_LIMIT_MS - INSPECTION_12S_WARNING_AT_MS) / 1000);

export function tickInspection(elapsedMs: number, lastShownSecond: number | null): TickResult {
  if (elapsedMs > INSPECTION_PLUS_TWO_MS) {
    return { kind: 'expired' };
  }

  const remainingSecond = Math.ceil((INSPECTION_LIMIT_MS - elapsedMs) / 1000);

  if (elapsedMs > INSPECTION_LIMIT_MS) {
    return { kind: 'plus_two', remainingSecond };
  }

  let warning: 8 | 12 | null = null;

  if (
    remainingSecond <= WARNING_12_REMAINING &&
    (lastShownSecond === null || lastShownSecond > WARNING_12_REMAINING)
  ) {
    warning = 12;
  }

  if (
    remainingSecond <= WARNING_8_REMAINING &&
    (lastShownSecond === null || lastShownSecond > WARNING_8_REMAINING)
  ) {
    warning = 8;
  }

  return { kind: 'continue', remainingSecond, warning };
}
