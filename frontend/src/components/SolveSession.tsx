import { useState, type ReactElement } from 'react';
import Timer from './Timer';
import Scramble from './Scramble';
import Header from './Header';
import SolveLog from './SolveLog';
import SolveHub from './SolveHub';
import ScramblePreview from './ScramblePreview';
import SolveDetailModal from './SolveDetailModal';
import HotkeyHelp from './HotkeyHelp';
import useHotkeys from '../hooks/useHotkeys';
import useScramblePreviewSettings from '../hooks/useScramblePreviewSettings';
import useSolveSession from '../hooks/useSolveSession';
import './SolveSession.css';

const SolveSession = (): ReactElement => {
  const {
    puzzleType,
    setPuzzleType,
    solves,
    mostRecent,
    recentSolves,
    pbHistory,
    lastPercentile,
    currentMedian,
    nextCursor,
    isLoadingMore,
    currentScramble,
    scrambleLoading,
    handleSolveComplete,
    handleSolveUpdate,
    handleSolveDelete,
    handleTypeChange,
    loadMore,
    clearView,
  } = useSolveSession();

  // Alt+digit puzzle shortcuts. Order mirrors Header.PUZZLES:
  // 1..9 cover 2x2 through Skewb, 0 selects SQ-1. Clock is the 11th
  // puzzle and stays mouse-only (no sensible digit key left).
  const PUZZLE_HOTKEYS: Record<string, typeof puzzleType> = {
    'Alt+1': '222',
    'Alt+2': '333',
    'Alt+3': '444',
    'Alt+4': '555',
    'Alt+5': '666',
    'Alt+6': '777',
    'Alt+7': 'pyram',
    'Alt+8': 'mega',
    'Alt+9': 'skewb',
    'Alt+0': 'sq1',
  };

  const { enabled: previewEnabled } = useScramblePreviewSettings();
  const [hubTab, setHubTab] = useState<'stats' | 'preview'>('stats');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useHotkeys(
    {
      '2': () => {
        if (mostRecent) handleSolveUpdate({ ...mostRecent, plus_two: !mostRecent.plus_two });
      },
      'd': () => {
        if (mostRecent) handleSolveUpdate({ ...mostRecent, dnf: !mostRecent.dnf });
      },
      'Shift+d': () => {
        if (mostRecent && window.confirm('Delete most recent solve?')) {
          handleSolveDelete(mostRecent);
        }
      },
      '?': () => setHelpOpen(true),
      'Shift+?': () => setHelpOpen(true),
      ...Object.fromEntries(
        Object.entries(PUZZLE_HOTKEYS).map(([combo, puzzle]) => [
          combo,
          () => setPuzzleType(puzzle),
        ]),
      ),
    },
    selectedIndex === null && !helpOpen,
  );

  const selectedSolve = selectedIndex !== null ? solves[selectedIndex] ?? null : null;
  const detailWindowStart = selectedIndex === null ? 0 : Math.max(0, selectedIndex - 2);
  const detailWindow = selectedIndex === null
    ? []
    : solves.slice(detailWindowStart, Math.min(solves.length, selectedIndex + 3));
  const detailWindowIndex = selectedIndex === null ? 0 : selectedIndex - detailWindowStart;

  return (
    <div className="solve-session">
      <Header type={puzzleType} handleTypeChange={handleTypeChange} />
      <div className="main-content">
        <div className="timer-section">
          <Timer onSolveComplete={handleSolveComplete} />
        </div>
        <div className="mid-section">
          <div className="left-section">
            <div className="scramble-wrapper">
              <Scramble
                type={puzzleType}
                scramble={currentScramble}
                loading={scrambleLoading}
              />
            </div>
            <div className="solve-hub-wrapper">
              <div className="hub-tabs">
                <button
                  type="button"
                  className={`hub-tab${hubTab === 'stats' ? ' active' : ''}`}
                  onClick={() => setHubTab('stats')}
                  aria-pressed={hubTab === 'stats'}
                >
                  Stats
                </button>
                {previewEnabled && (
                  <button
                    type="button"
                    className={`hub-tab${hubTab === 'preview' ? ' active' : ''}`}
                    onClick={() => setHubTab('preview')}
                    aria-pressed={hubTab === 'preview'}
                  >
                    Preview
                  </button>
                )}
              </div>
              {previewEnabled && hubTab === 'preview' ? (
                <ScramblePreview puzzleType={puzzleType} scramble={currentScramble} />
              ) : (
                <SolveHub
                  solves={solves}
                  recentSolves={recentSolves}
                  pbHistory={pbHistory}
                  lastPercentile={lastPercentile}
                  currentMedian={currentMedian}
                />
              )}
            </div>
          </div>
          <div className="right-section">
            <SolveLog
              solves={solves}
              onSolveUpdate={handleSolveUpdate}
              onSolveDelete={handleSolveDelete}
              onSolveClick={(_, idx) => setSelectedIndex(idx)}
              onReset={clearView}
              onLoadMore={loadMore}
              hasMore={!!nextCursor}
              isLoadingMore={isLoadingMore}
            />
          </div>
        </div>
      </div>
      {helpOpen && <HotkeyHelp onClose={() => setHelpOpen(false)} />}
      {selectedSolve && (
        <SolveDetailModal
          solve={selectedSolve}
          window={detailWindow}
          index={detailWindowIndex}
          onClose={() => setSelectedIndex(null)}
          onUpdate={s => { handleSolveUpdate(s); setSelectedIndex(null); }}
          onDelete={s => handleSolveDelete(s)}
        />
      )}
    </div>
  );
};

export default SolveSession;
