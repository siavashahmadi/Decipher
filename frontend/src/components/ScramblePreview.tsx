import React, { useEffect, useRef } from 'react';
import type { PuzzleType } from '../types';
import { scrambleEventToTwisty } from '../utils/puzzleIds';
import useScramblePreviewSettings from '../hooks/useScramblePreviewSettings';
import './ScramblePreview.css';

interface ScramblePreviewProps {
  puzzleType: PuzzleType;
  scramble: string | null;
}

const ScramblePreview = ({ puzzleType, scramble }: ScramblePreviewProps): React.ReactElement => {
  const { mode, collapsed, setMode, setCollapsed } = useScramblePreviewSettings();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const twistyPuzzle = scrambleEventToTwisty(puzzleType);
  const supported = twistyPuzzle !== null;

  useEffect(() => {
    if (!supported || !stageRef.current) return;
    let cancelled = false;
    const stage = stageRef.current;

    (async () => {
      const { TwistyPlayer } = await import('cubing/twisty');
      if (cancelled) return;
      const player = new TwistyPlayer({
        puzzle: twistyPuzzle ?? '3x3x3',
        alg: scramble ?? '',
        background: 'none',
        controlPanel: 'none',
        visualization: mode,
      });
      playerRef.current = player as unknown as HTMLElement;
      stage.appendChild(player);
    })();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
    // mode and scramble are intentionally omitted: mode/scramble changes
    // are handled by the separate effects in Task 5 without a remount.
  }, [supported, twistyPuzzle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const player = playerRef.current as unknown as { alg?: string } | null;
    if (player && scramble !== null) {
      player.alg = scramble;
    }
  }, [scramble]);

  useEffect(() => {
    const player = playerRef.current as unknown as { visualization?: string } | null;
    if (player) {
      player.visualization = mode;
    }
  }, [mode]);

  return (
    <div className={`scramble-preview${collapsed ? ' collapsed' : ''}`}>
      <div className="scramble-preview-stage" ref={stageRef}>
        {!supported && (
          <div className="scramble-preview-placeholder">Preview not available</div>
        )}
      </div>
      <div className="scramble-preview-controls">
        <button
          type="button"
          className="scramble-preview-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Show preview' : 'Hide preview'}
          title={collapsed ? 'Show preview' : 'Hide preview'}
        >
          {collapsed ? '\u25BE' : '\u25B4'}
        </button>
        {supported && !collapsed && (
          <>
            <button
              type="button"
              className={`scramble-preview-mode-btn${mode === '3D' ? ' active' : ''}`}
              onClick={() => setMode('3D')}
              aria-pressed={mode === '3D'}
            >
              3D
            </button>
            <button
              type="button"
              className={`scramble-preview-mode-btn${mode === '2D' ? ' active' : ''}`}
              onClick={() => setMode('2D')}
              aria-pressed={mode === '2D'}
            >
              2D
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ScramblePreview;
