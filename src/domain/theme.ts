export interface Theme {
  id: string;
  name: string;
  fontFamily: string;
  colors: {
    background: string;
    text: string;
    mutedText: string;
    accent: string;
    surface: string;
    border: string;
  };
  chartPalette: readonly string[];
}

export const THEMES: Readonly<Record<string, Theme>> = {
  default: {
    id: 'default',
    name: 'Clean',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    colors: {
      background: '#ffffff',
      text: '#1b1f24',
      mutedText: '#5b6573',
      accent: '#2f6fdb',
      surface: '#f3f5f8',
      border: '#d5dae1',
    },
    chartPalette: ['#2f6fdb', '#e8773a', '#2fa37a', '#8c5cd6', '#d94f6b', '#c9a227'],
  },
};

export const DEFAULT_THEME_ID = 'default';

export function getTheme(themeId: string): Theme {
  return THEMES[themeId] ?? THEMES[DEFAULT_THEME_ID]!;
}
