import React from 'react';
import type { Theme } from '../hooks/useSettings';
import type { PreviewMode } from '../hooks/useScramblePreviewSettings';
import './SettingsPanel.css';

interface SettingsPanelProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  inspectionEnabled: boolean;
  setInspectionEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  holdMs: number;
  setHoldMs: (ms: number) => void;
  previewEnabled: boolean;
  setPreviewEnabled: (enabled: boolean) => void;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
  showHintFacelets: boolean;
  setShowHintFacelets: (show: boolean) => void;
}

const THEMES: Theme[] = ['system', 'light', 'dark'];
const themeLabel = (t: Theme): string => t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark';

const SettingsPanel = ({
  theme, setTheme,
  inspectionEnabled, setInspectionEnabled,
  soundEnabled, setSoundEnabled,
  holdMs, setHoldMs,
  previewEnabled, setPreviewEnabled,
  previewMode, setPreviewMode,
  showHintFacelets, setShowHintFacelets,
}: SettingsPanelProps): React.ReactElement => {
  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <h2 className="settings-panel-title">Settings</h2>

      <div className="settings-row">
        <span className="settings-row-label">Theme</span>
        <div className="settings-segmented">
          {THEMES.map(t => (
            <button
              key={t}
              type="button"
              className={theme === t ? 'active' : ''}
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
            >
              {themeLabel(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">Inspection</span>
        <button
          type="button"
          role="switch"
          aria-checked={inspectionEnabled}
          aria-label="Inspection"
          className={`settings-switch ${inspectionEnabled ? 'on' : 'off'}`}
          onClick={() => setInspectionEnabled(!inspectionEnabled)}
        >
          {inspectionEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="settings-row">
        <span className="settings-row-label">Sound</span>
        <button
          type="button"
          role="switch"
          aria-checked={soundEnabled}
          aria-label="Sound"
          className={`settings-switch ${soundEnabled ? 'on' : 'off'}`}
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="settings-row settings-row-stack">
        <span className="settings-row-label">
          Hold-to-start delay <span className="settings-hold-value">{holdMs} ms</span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={50}
          value={holdMs}
          aria-label="Hold-to-start delay milliseconds"
          onChange={e => setHoldMs(Number(e.target.value))}
        />
      </div>

      <div className="settings-row">
        <span className="settings-row-label">3D scramble preview</span>
        <button
          type="button"
          role="switch"
          aria-checked={previewEnabled}
          aria-label="3D scramble preview"
          className={`settings-switch ${previewEnabled ? 'on' : 'off'}`}
          onClick={() => setPreviewEnabled(!previewEnabled)}
        >
          {previewEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {previewEnabled && (
        <div className="settings-row">
          <span className="settings-row-label">View mode</span>
          <div className="settings-segmented">
            <button
              type="button"
              className={previewMode === '3D' ? 'active' : ''}
              aria-pressed={previewMode === '3D'}
              onClick={() => setPreviewMode('3D')}
            >
              3D
            </button>
            <button
              type="button"
              className={previewMode === '2D' ? 'active' : ''}
              aria-pressed={previewMode === '2D'}
              onClick={() => setPreviewMode('2D')}
            >
              2D
            </button>
          </div>
        </div>
      )}

      {previewEnabled && previewMode === '3D' && (
        <div className="settings-row">
          <span className="settings-row-label">Hint facelets</span>
          <button
            type="button"
            role="switch"
            aria-checked={showHintFacelets}
            aria-label="Hint facelets"
            className={`settings-switch ${showHintFacelets ? 'on' : 'off'}`}
            onClick={() => setShowHintFacelets(!showHintFacelets)}
          >
            {showHintFacelets ? 'On' : 'Off'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
