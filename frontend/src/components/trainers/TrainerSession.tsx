import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import Timer from '../Timer';
import Scramble from '../Scramble';
import ScramblePreview from '../ScramblePreview';
import TrainerCasePicker from './TrainerCasePicker';
import type { CaseChoice, AlgChoice } from './TrainerCasePicker';
import TrainerRecentStrip from './TrainerRecentStrip';
import type { RecentEntry } from './TrainerRecentStrip';
import {
  generateTrainerScramble,
  CASES_BY_TYPE,
  type TrainerType,
} from '../../utils/trainerScramble';
import './PllTrainer.css';

const RECENT_CAP = 5;

const storageKey = (type: TrainerType): string => `trainer-recent:${type}`;

const loadRecent = (type: TrainerType): RecentEntry[] => {
  try {
    const raw = sessionStorage.getItem(storageKey(type));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecent = (type: TrainerType, entries: RecentEntry[]): void => {
  try {
    sessionStorage.setItem(storageKey(type), JSON.stringify(entries));
  } catch {
    // Private-mode Safari or quota; fall back to in-memory only.
  }
};

interface TrainerSessionProps {
  type: TrainerType;
}

const buildScramble = (
  type: TrainerType,
  caseChoice: CaseChoice,
  algChoice: AlgChoice
): string => {
  const { scramble } = generateTrainerScramble({
    type,
    caseId: caseChoice,
    algIndex: algChoice === 'any' ? -1 : algChoice,
  });
  return scramble;
};

const TrainerSession = ({ type }: TrainerSessionProps): ReactElement => {
  const [caseChoice, setCaseChoice] = useState<CaseChoice>('all');
  const [algChoice, setAlgChoice] = useState<AlgChoice>('any');
  const [recent, setRecent] = useState<RecentEntry[]>(() => loadRecent(type));
  // bumpCounter forces a fresh scramble on Skip / after-solve without
  // having to track scramble itself in state.
  const [bumpCounter, setBumpCounter] = useState(0);

  // Detect a type change during render (the React docs' "storing
  // information from previous renders" pattern). Setting state during
  // render schedules an immediate re-render with the corrected case/alg,
  // so the scramble useMemo below runs exactly once per type change
  // instead of twice.
  const [prevType, setPrevType] = useState(type);
  if (prevType !== type) {
    setPrevType(type);
    setCaseChoice('all');
    setAlgChoice('any');
  }

  const scramble = useMemo(
    () => buildScramble(type, caseChoice, algChoice),
    // bumpCounter is in deps so Skip / after-solve regenerate.
    [type, caseChoice, algChoice, bumpCounter],
  );

  useEffect(() => {
    setRecent(loadRecent(type));
  }, [type]);

  useEffect(() => {
    saveRecent(type, recent);
  }, [type, recent]);

  const handleCaseChange = useCallback((next: CaseChoice) => {
    setCaseChoice(next);
    setAlgChoice('any');
  }, []);

  const handleAlgChange = useCallback((next: AlgChoice) => {
    setAlgChoice(next);
  }, []);

  const handleSkip = useCallback(() => {
    setBumpCounter((c) => c + 1);
  }, []);

  const handleSolveComplete = useCallback(
    (time: number, flags: { plusTwo: boolean; dnf: boolean }) => {
      setRecent((prev) =>
        [{ time, plusTwo: flags.plusTwo, dnf: flags.dnf }, ...prev].slice(
          0,
          RECENT_CAP
        )
      );
      setBumpCounter((c) => c + 1);
    },
    []
  );

  return (
    <div className="pll-trainer">
      <TrainerCasePicker
        cases={CASES_BY_TYPE[type]}
        caseChoice={caseChoice}
        algChoice={algChoice}
        onCaseChange={handleCaseChange}
        onAlgChange={handleAlgChange}
        onSkip={handleSkip}
      />

      <Scramble type="333" scramble={scramble} loading={false} />

      <div className="pll-trainer-preview">
        <ScramblePreview puzzleType="333" scramble={scramble} />
      </div>

      <div className="pll-trainer-timer">
        <Timer onSolveComplete={handleSolveComplete} />
      </div>

      <TrainerRecentStrip entries={recent} />
    </div>
  );
};

export default TrainerSession;
