import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import DateRangeFilter from '../components/stats/DateRangeFilter';
import StatsSummary from '../components/stats/StatsSummary';
import DotPlot from '../components/stats/DotPlot';
import Histogram from '../components/stats/Histogram';
import PBProgression from '../components/stats/PBProgression';
import ActivityHeatmap from '../components/stats/ActivityHeatmap';
import useAllSolves from '../hooks/useAllSolves';
import { computeSummary } from '../utils/statsBuckets';
import { getPresetBounds, filterSolvesByRange, type DateRangePreset } from '../utils/dateRanges';
import { buildCsv, downloadCsv } from '../utils/exportCsv';
import type { PuzzleType } from '../types';
import './Stats.css';

const DEFAULT_PUZZLE: PuzzleType = '333';

interface StatsPageProps {
  isGuest: boolean;
  onSignIn: () => void;
}

const StatsPage = ({ isGuest, onSignIn }: StatsPageProps): React.ReactElement => {
  const [searchParams, setSearchParams] = useSearchParams();
  const puzzleType = (searchParams.get('puzzle') as PuzzleType | null) ?? DEFAULT_PUZZLE;

  const [preset, setPreset] = useState<DateRangePreset>('all');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const { solves, loading } = useAllSolves(puzzleType, isGuest);

  const bounds = useMemo(() => {
    if (preset === 'custom') {
      return {
        start: customStart ? new Date(customStart) : null,
        end: customEnd ? new Date(`${customEnd}T23:59:59.999Z`) : null,
      };
    }
    return getPresetBounds(preset);
  }, [preset, customStart, customEnd]);

  const filteredSolves = useMemo(() => filterSolvesByRange(solves, bounds), [solves, bounds]);
  const summary = useMemo(() => computeSummary(filteredSolves), [filteredSolves]);

  const handleExport = (): void => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `decipher-${puzzleType}-${today}.csv`;
    downloadCsv(filename, buildCsv(filteredSolves));
  };

  const heatmapFrom = useMemo(() => bounds.start ?? (solves.length
    ? new Date(solves[solves.length - 1].created_at)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)), [bounds.start, solves]);
  const heatmapTo = bounds.end ?? new Date();

  const handlePuzzleChange = (e: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent<HTMLButtonElement>) => {
    const value = (e.currentTarget as HTMLSelectElement | HTMLButtonElement).value as PuzzleType;
    setSearchParams(prev => { prev.set('puzzle', value); return prev; });
  };

  return (
    <div className="stats-page">
      <Header
        type={puzzleType}
        handleTypeChange={handlePuzzleChange}
        isGuest={isGuest}
        onSignIn={onSignIn}
      />
      <div className="stats-body">
        <div className="stats-toolbar">
          <DateRangeFilter
            preset={preset}
            customStart={customStart}
            customEnd={customEnd}
            onPresetChange={setPreset}
            onCustomChange={(s, e) => { setCustomStart(s); setCustomEnd(e); }}
          />
          <button
            type="button"
            className="stats-export-btn"
            onClick={handleExport}
            disabled={filteredSolves.length === 0}
            aria-label="Export filtered solves to CSV"
          >
            Export CSV
          </button>
        </div>

        {loading ? (
          <p className="stats-loading">Loading solves...</p>
        ) : (
          <div className="stats-grid">
            <section className="stats-card"><h2>Summary</h2><StatsSummary summary={summary} /></section>
            <section className="stats-card"><h2>Times</h2><DotPlot solves={filteredSolves} /></section>
            <section className="stats-card"><h2>Distribution</h2><Histogram solves={filteredSolves} /></section>
            <section className="stats-card"><h2>PB progression</h2><PBProgression puzzleType={puzzleType} isGuest={isGuest} /></section>
            <section className="stats-card"><h2>Activity</h2><ActivityHeatmap solves={filteredSolves} from={heatmapFrom} to={heatmapTo} /></section>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsPage;
