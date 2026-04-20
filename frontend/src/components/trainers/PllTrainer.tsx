import React, { useCallback, useEffect, useState } from 'react';
import Timer from '../Timer';
import Scramble from '../Scramble';
import ScramblePreview from '../ScramblePreview';
import TrainerCasePicker from './TrainerCasePicker';
import type { CaseChoice, AlgChoice } from './TrainerCasePicker';
import TrainerRecentStrip from './TrainerRecentStrip';
import type { RecentEntry } from './TrainerRecentStrip';
import { generatePllScramble } from '../../utils/trainerScramble';
import './PllTrainer.css';

const RECENT_CAP = 5;

const buildScramble = (caseChoice: CaseChoice, algChoice: AlgChoice): string => {
  const { scramble } = generatePllScramble({
    caseId: caseChoice,
    algIndex: algChoice === 'any' ? -1 : algChoice,
  });
  return scramble;
};

const PllTrainer = (): React.ReactElement => {
  const [caseChoice, setCaseChoice] = useState<CaseChoice>('all');
  const [algChoice, setAlgChoice] = useState<AlgChoice>('any');
  const [scramble, setScramble] = useState<string>(() =>
    buildScramble('all', 'any')
  );
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setScramble(buildScramble(caseChoice, algChoice));
  }, [caseChoice, algChoice]);

  const handleCaseChange = useCallback((next: CaseChoice) => {
    setCaseChoice(next);
    setAlgChoice('any');
  }, []);

  const handleAlgChange = useCallback((next: AlgChoice) => {
    setAlgChoice(next);
  }, []);

  const handleSkip = useCallback(() => {
    setScramble(buildScramble(caseChoice, algChoice));
  }, [caseChoice, algChoice]);

  const handleSolveComplete = useCallback(
    (time: number, flags: { plusTwo: boolean; dnf: boolean }) => {
      setRecent((prev) =>
        [{ time, plusTwo: flags.plusTwo, dnf: flags.dnf }, ...prev].slice(
          0,
          RECENT_CAP
        )
      );
      setScramble(buildScramble(caseChoice, algChoice));
    },
    [caseChoice, algChoice]
  );

  return (
    <div className="pll-trainer">
      <TrainerCasePicker
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

export default PllTrainer;
