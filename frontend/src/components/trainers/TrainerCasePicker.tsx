import React from 'react';
import { PLL_CASES, PLL_CASE_MAP } from '../../utils/trainerScramble';
import './TrainerCasePicker.css';

export type CaseChoice = 'all' | string;
export type AlgChoice = 'any' | number;

interface TrainerCasePickerProps {
  caseChoice: CaseChoice;
  algChoice: AlgChoice;
  onCaseChange: (next: CaseChoice) => void;
  onAlgChange: (next: AlgChoice) => void;
  onSkip: () => void;
}

const TrainerCasePicker = ({
  caseChoice,
  algChoice,
  onCaseChange,
  onAlgChange,
  onSkip,
}: TrainerCasePickerProps): React.ReactElement => {
  const selectedCase = caseChoice === 'all' ? null : PLL_CASE_MAP[caseChoice];
  const algs = selectedCase?.algs ?? [];

  return (
    <div className="trainer-case-picker">
      <label className="trainer-case-picker-field">
        <span>Case</span>
        <select
          value={caseChoice}
          onChange={(e) => onCaseChange(e.target.value as CaseChoice)}
        >
          <option value="all">All</option>
          {PLL_CASES.map((c) => (
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
