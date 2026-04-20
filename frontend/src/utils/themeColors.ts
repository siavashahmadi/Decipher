import type { EffectiveTheme } from '../hooks/useSettings';

export interface ChartColors {
  axis: string;
  recent: string;
  pb: string;
}

const palette: Record<EffectiveTheme, ChartColors> = {
  dark: {
    axis:   '#e4e4e4',
    recent: '#3dc942',
    pb:     '#f5a623',
  },
  light: {
    axis:   '#1a1a1a',
    recent: '#2ea934',
    pb:     '#d48806',
  },
};

export const chartColors = (theme: EffectiveTheme): ChartColors => palette[theme];
