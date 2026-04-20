import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateRangeFilter from './DateRangeFilter';

describe('DateRangeFilter', () => {
  it('fires onPresetChange when a preset button is clicked', () => {
    const onPresetChange = vi.fn();
    render(
      <DateRangeFilter
        preset="all"
        customStart={null}
        customEnd={null}
        onPresetChange={onPresetChange}
        onCustomChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /last 7 days/i }));
    expect(onPresetChange).toHaveBeenCalledWith('7d');
  });

  it('renders date inputs only in custom mode', () => {
    const { rerender } = render(
      <DateRangeFilter preset="all" customStart={null} customEnd={null}
        onPresetChange={() => {}} onCustomChange={() => {}} />,
    );
    expect(screen.queryByLabelText(/from/i)).toBeNull();
    rerender(
      <DateRangeFilter preset="custom" customStart={null} customEnd={null}
        onPresetChange={() => {}} onCustomChange={() => {}} />,
    );
    expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
  });
});
