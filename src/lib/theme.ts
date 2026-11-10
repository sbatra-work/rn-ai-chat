import { useColorScheme } from 'react-native';

/**
 * Design tokens. Components read colors from `useTheme()` and never
 * hard-code them, which is what keeps light and dark mode in step.
 *
 * Text and background pairs meet WCAG AA contrast (4.5:1) in both palettes.
 */

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  userBubble: string;
  onUserBubble: string;
  assistantBubble: string;
  onAssistantBubble: string;
  danger: string;
  warningSurface: string;
  onWarningSurface: string;
}

const light: Palette = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  border: '#D5D8DE',
  text: '#14171F',
  textMuted: '#5A6072',
  primary: '#2B59D9',
  onPrimary: '#FFFFFF',
  userBubble: '#2B59D9',
  onUserBubble: '#FFFFFF',
  assistantBubble: '#EDEFF3',
  onAssistantBubble: '#14171F',
  danger: '#B3261E',
  warningSurface: '#FFF2CC',
  onWarningSurface: '#4A3800',
};

const dark: Palette = {
  background: '#0F1115',
  surface: '#1A1D24',
  border: '#343944',
  text: '#F1F3F7',
  textMuted: '#A3AABB',
  primary: '#8FB0FF',
  onPrimary: '#0B1A44',
  userBubble: '#3D66DB',
  onUserBubble: '#FFFFFF',
  assistantBubble: '#232730',
  onAssistantBubble: '#F1F3F7',
  danger: '#FFB4AB',
  warningSurface: '#3D3000',
  onWarningSurface: '#FFE9A6',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { md: 12, lg: 18 } as const;
/** Smallest comfortable touch target, from the iOS and Android guidelines. */
export const MIN_TOUCH_SIZE = 44;

export interface Theme {
  dark: boolean;
  colors: Palette;
}

const lightTheme: Theme = { dark: false, colors: light };
const darkTheme: Theme = { dark: true, colors: dark };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
