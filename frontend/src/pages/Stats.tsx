import { useMemo, type ChangeEvent, type MouseEvent, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import DateRangeFilter from '../components/stats/DateRangeFilter';
import StatsSummary from '../components/stats/StatsSummary';
import RecentTrend from '../components/stats/RecentTrend';
import DotPlot from '../components/stats/DotPlot';
import Histogram from '../components/stats/Histogram';
import PBProgression from '../components/stats/PBProgression';
import ActivityHeatmap from '../components/stats/ActivityHeatmap';
import ScrambleHistory from '../components/stats/ScrambleHistory';
import useAllSolves from '../hooks/useAllSolves';
import { MAX_SOLVES } from '../queries/solves';
import { useStatsFilters } from '../hooks/useStatsFilters';
import { useAuth } from '../contexts/AuthContext';
import { computeSummary } from '../utils/statsBuckets';
import { computeRecentTrend } from '../utils/recentTrend';
import { buildCsv, downloadCsv } from '../utils/exportCsv';
import { isPuzzleType, type PuzzleType, type Solve } from '../types';
import './Stats.css';

const DEFAULT_PUZZLE: PuzzleType = '333';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// The heatmap's start date prefers the active filter bound, then falls back
// to the oldest fetched solve, and finally to "one year ago" so an empty
// account still renders a sensibly-sized grid.
const computeHeatmapFrom = (boundsStart: Date | null, solves: Solve[]): Date => {
  if (boundsStart) return boundsStart;
  if (solves.length > 0) return new Date(solves[solves.length - 1]!.created_at);
  return new Date(Date.now() - ONE_YEAR_MS);
};

const StatsPage = (): ReactElement => {
  const { isGuest } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const puzzleParam = searchParams.get('puzzle');
  const puzzleType: PuzzleType = isPuzzleType(puzzleParam) ? puzzleParam : DEFAULT_PUZZLE;

  const { solves, loading, truncated } = useAllSolves(puzzleType, isGuest);
  const { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, bounds, filteredSolves } = useStatsFilters(solves);
  const summary = useMemo(() => computeSummary(filteredSolves), [filteredSolves]);
  const trend = useMemo(() => computeRecentTrend(filteredSolves), [filteredSolves]);

  const handleExport = (): void => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `decipher-${puzzleType}-${today}.csv`;
    downloadCsv(filename, buildCsv(filteredSolves));
  };

  const heatmapFrom = useMemo(
    () => computeHeatmapFrom(bounds.start, solves),
    [bounds.start, solves],
  );
  const heatmapTo = bounds.end ?? new Date();

  const handlePuzzleChange = (e: ChangeEvent<HTMLSelectElement> | MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget as HTMLSelectElement | HTMLButtonElement;
    if (!isPuzzleType(target.value)) return;
    const value = target.value;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('puzzle', value);
      return next;
    });
  };

  return (
    <div className="stats-page">
      <Header
        type={puzzleType}
        handleTypeChange={handlePuzzleChange}
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
            {truncated && (
              <p className="stats-truncation-notice">
                Showing your most recent {MAX_SOLVES.toLocaleString()} solves. Use the date range filter to see older ranges.
              </p>
            )}
            {trend && (
              <section className="stats-card"><h2>Trend</h2><RecentTrend solves={filteredSolves} /></section>
            )}
            <section className="stats-card"><h2>Summary</h2><StatsSummary summary={summary} /></section>
            <section className="stats-card"><h2>Times</h2><DotPlot solves={filteredSolves} /></section>
            <section className="stats-card"><h2>Distribution</h2><Histogram solves={filteredSolves} /></section>
            <section className="stats-card"><h2>PB progression</h2><PBProgression puzzleType={puzzleType} isGuest={isGuest} /></section>
            <section className="stats-card"><h2>Activity</h2><ActivityHeatmap solves={filteredSolves} from={heatmapFrom} to={heatmapTo} /></section>
            <section className="stats-card stats-card-wide">
              <h2>Scramble history</h2>
              <ScrambleHistory solves={filteredSolves} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsPage;
