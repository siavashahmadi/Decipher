import React, { useCallback, useEffect, useState } from 'react';
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

const TrainerSession = ({ type }: TrainerSessionProps): React.ReactElement => {
  const [caseChoice, setCaseChoice] = useState<CaseChoice>('all');
  const [algChoice, setAlgChoice] = useState<AlgChoice>('any');
  const [scramble, setScramble] = useState<string>(() =>
    buildScramble(type, 'all', 'any')
  );
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setCaseChoice('all');
    setAlgChoice('any');
    setRecent([]);
    setScramble(buildScramble(type, 'all', 'any'));
  }, [type]);

  useEffect(() => {
    setScramble(buildScramble(type, caseChoice, algChoice));
  }, [type, caseChoice, algChoice]);

  const handleCaseChange = useCallback((next: CaseChoice) => {
    setCaseChoice(next);
    setAlgChoice('any');
  }, []);

  const handleAlgChange = useCallback((next: AlgChoice) => {
    setAlgChoice(next);
  }, []);

  const handleSkip = useCallback(() => {
    setScramble(buildScramble(type, caseChoice, algChoice));
  }, [type, caseChoice, algChoice]);

  const handleSolveComplete = useCallback(
    (time: number, flags: { plusTwo: boolean; dnf: boolean }) => {
      setRecent((prev) =>
        [{ time, plusTwo: flags.plusTwo, dnf: flags.dnf }, ...prev].slice(
          0,
          RECENT_CAP
        )
      );
      setScramble(buildScramble(type, caseChoice, algChoice));
    },
    [type, caseChoice, algChoice]
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
