import { useMemo, type ReactElement } from 'react';
import type { TrainerCase } from '../../utils/trainerScramble';
import './TrainerCasePicker.css';

export type CaseChoice = { kind: 'all' } | { kind: 'id'; id: string };
export type AlgChoice = 'any' | number;

export const ALL_CASES: CaseChoice = { kind: 'all' };

export const caseChoiceFromValue = (value: string): CaseChoice =>
  value === 'all' ? ALL_CASES : { kind: 'id', id: value };

export const caseChoiceToValue = (choice: CaseChoice): string =>
  choice.kind === 'all' ? 'all' : choice.id;

interface TrainerCasePickerProps {
  cases: TrainerCase[];
  caseChoice: CaseChoice;
  algChoice: AlgChoice;
  onCaseChange: (next: CaseChoice) => void;
  onAlgChange: (next: AlgChoice) => void;
  onSkip: () => void;
}

interface Grouped {
  label: string;
  cases: TrainerCase[];
}

const groupCases = (cases: TrainerCase[]): Grouped[] | null => {
  const hasGroups = cases.some((c) => c.group);
  if (!hasGroups) return null;

  const order: string[] = [];
  const byGroup = new Map<string, TrainerCase[]>();
  for (const c of cases) {
    const label = c.group ?? 'Other';
    if (!byGroup.has(label)) {
      byGroup.set(label, []);
      order.push(label);
    }
    byGroup.get(label)!.push(c);
  }
  return order.map((label) => ({ label, cases: byGroup.get(label)! }));
};

const TrainerCasePicker = ({
  cases,
  caseChoice,
  algChoice,
  onCaseChange,
  onAlgChange,
  onSkip,
}: TrainerCasePickerProps): ReactElement => {
  const grouped = useMemo(() => groupCases(cases), [cases]);
  const selectedCase =
    caseChoice.kind === 'all' ? null : cases.find((c) => c.id === caseChoice.id) ?? null;
  const algs = selectedCase?.algs ?? [];

  return (
    <div className="trainer-case-picker">
      <label className="trainer-case-picker-field">
        <span>Case</span>
        <select
          value={caseChoiceToValue(caseChoice)}
          onChange={(e) => onCaseChange(caseChoiceFromValue(e.target.value))}
        >
          <option value="all">All</option>
          {grouped
            ? grouped.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
        </select>
      </label>

      <label className="trainer-case-picker-field">
        <span>Alg</span>
        <select
          value={algChoice === 'any' ? 'any' : String(algChoice)}
          onChange={(e) => {
            const v = e.target.value;
            onAlgChange(v === 'any' ? 'any' : Number(v));
          }}
          disabled={!selectedCase || algs.length <= 1}
        >
          <option value="any">Any</option>
          {algs.map((alg, idx) => (
            <option key={idx} value={idx}>
              {`#${idx + 1}: ${alg}`}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="trainer-skip-btn" onClick={onSkip}>
        Skip scramble
      </button>
    </div>
  );
};

export default TrainerCasePicker;
