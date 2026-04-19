import React, { useRef } from 'react';
import type { PuzzleType } from '../types';
import { scrambleEventToTwisty } from '../utils/puzzleIds';
import useScramblePreviewSettings from '../hooks/useScramblePreviewSettings';
import './ScramblePreview.css';

interface ScramblePreviewProps {
  puzzleType: PuzzleType;
  scramble: string | null;
}

const ScramblePreview = ({ puzzleType, scramble: _scramble }: ScramblePreviewProps): React.ReactElement => {
  const { mode, collapsed, setMode, setCollapsed } = useScramblePreviewSettings();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const twistyPuzzle = scrambleEventToTwisty(puzzleType);
  const supported = twistyPuzzle !== null;

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
            >
              3D
            </button>
            <button
              type="button"
              className={`scramble-preview-mode-btn${mode === '2D' ? ' active' : ''}`}
              onClick={() => setMode('2D')}
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
