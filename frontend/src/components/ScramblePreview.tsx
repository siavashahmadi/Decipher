import { useEffect, useRef, type ReactElement } from 'react';
import type { PuzzleType } from '../types';
import { scrambleEventToTwisty } from '../utils/puzzleIds';
import useScramblePreviewSettings from '../hooks/useScramblePreviewSettings';
import './ScramblePreview.css';

interface ScramblePreviewProps {
  puzzleType: PuzzleType;
  scramble: string | null;
}

const ScramblePreview = ({ puzzleType, scramble }: ScramblePreviewProps): ReactElement => {
  const { mode, collapsed, setCollapsed, showHintFacelets } = useScramblePreviewSettings();
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
        hintFacelets: showHintFacelets ? 'floating' : 'none',
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
    // mode, scramble, and showHintFacelets are intentionally omitted: each
    // has its own effect below that mutates the live player property directly,
    // avoiding a full remount on every solve or settings change.
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

  useEffect(() => {
    const player = playerRef.current as unknown as { hintFacelets?: string } | null;
    if (player) {
      player.hintFacelets = showHintFacelets ? 'floating' : 'none';
    }
  }, [showHintFacelets]);

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
      </div>
    </div>
  );
};

export default ScramblePreview;
