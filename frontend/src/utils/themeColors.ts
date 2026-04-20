import type { EffectiveTheme } from '../hooks/useSettings';

export interface HeatmapColors {
  empty: string;
  scale: string[];
  border: string;
  text: string;
  tooltipBg: string;
  worst: string;
}

export interface ChartColors {
  axis: string;
  recent: string;
  pb: string;
  heatmap: HeatmapColors;
}

const palette: Record<EffectiveTheme, ChartColors> = {
  dark: {
    axis:   '#e4e4e4',
    recent: '#3dc942',
    pb:     '#f5a623',
    heatmap: {
      empty: '#2a2a2a',
      scale: ['#1c2a20', '#254d36', '#2f7d4f', '#3bb26a', '#5ad48a'],
      border: '#121212',
      text: '#e5e5e5',
      tooltipBg: '#1e1e1e',
      worst: '#ef4444',
    },
  },
  light: {
    axis:   '#1a1a1a',
    recent: '#2ea934',
    pb:     '#d48806',
    heatmap: {
      empty: '#ececea',
      scale: ['#e6f4ea', '#a8d5b0', '#68b97a', '#2f9e44', '#1b6a2d'],
      border: '#ffffff',
      text: '#1a1a1a',
      tooltipBg: '#ffffff',
      worst: '#ef4444',
    },
  },
};

export const chartColors = (theme: EffectiveTheme): ChartColors => palette[theme];
