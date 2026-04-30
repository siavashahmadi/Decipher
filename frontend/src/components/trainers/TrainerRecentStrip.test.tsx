import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TrainerRecentStrip from './TrainerRecentStrip';

describe('TrainerRecentStrip', () => {
  it('renders one entry per item', () => {
    render(
      <TrainerRecentStrip entries={[
        { time: 12340, plusTwo: false, dnf: false },
        { time: 14500, plusTwo: true, dnf: false },
        { time: 8000, plusTwo: false, dnf: true },
      ]} />,
    );
    const entries = screen.getAllByText(/.+/, { selector: 'span.trainer-recent-entry' });
    expect(entries).toHaveLength(3);
  });

  it('does not warn about duplicate keys with three identical times', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TrainerRecentStrip entries={[
        { time: 12340, plusTwo: false, dnf: false },
        { time: 12340, plusTwo: true, dnf: false },
        { time: 12340, plusTwo: false, dnf: true },
      ]} />,
    );
    const keyWarnings = spy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('unique "key"'),
    );
    expect(keyWarnings).toHaveLength(0);
    spy.mockRestore();
  });
});
