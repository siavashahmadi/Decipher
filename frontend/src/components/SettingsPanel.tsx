import React from 'react';
import type { Theme } from '../hooks/useSettings';
import type { PreviewMode } from '../hooks/useScramblePreviewSettings';
import './SettingsPanel.css';

interface SettingsPanelProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  previewEnabled: boolean;
  setPreviewEnabled: (enabled: boolean) => void;
  previewMode: PreviewMode;
  setPreviewMode: (mode: PreviewMode) => void;
}

const SettingsPanel = ({
  theme,
  setTheme,
  previewEnabled,
  setPreviewEnabled,
  previewMode,
  setPreviewMode,
}: SettingsPanelProps): React.ReactElement => {
  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <h2 className="settings-panel-title">Settings</h2>

      <div className="settings-row">
        <span className="settings-row-label">Theme</span>
        <div className="settings-segmented">
          <button
            type="button"
            className={theme === 'light' ? 'active' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
          >
            Light
          </button>
          <button
            type="button"
            className={theme === 'dark' ? 'active' : ''}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
          >
            Dark
          </button>
        </div>
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
    </div>
  );
};

export default SettingsPanel;
