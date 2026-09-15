import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeColors = {
  isDark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  primary: string;
  primaryDeep: string;
  text: string;
  muted: string;
  border: string;
  inputBg: string;
  success: string;
  warning: string;
  danger: string;
  ph: string;
  turbidity: string;
  tds: string;
  waterLevel: string;
  tabBar: string;
  tabBorder: string;
  modalOverlay: string;
  alertBg: string;
  filterBannerBg: string;
  filterBannerBorder: string;
  ackBtnBg: string;
};

// ── A2: Environmental Green & White ──────────────────────────────────────────
const LIGHT: ThemeColors = {
  isDark: false,
  bg:                '#F8FAFC',
  card:              '#FFFFFF',
  cardAlt:           '#F0FDF4',
  primary:           '#16A34A',
  primaryDeep:       '#15803D',
  text:              '#0F172A',
  muted:             '#64748B',
  border:            '#E2E8F0',
  inputBg:           '#F1F5F9',
  success:           '#16A34A',
  warning:           '#D97706',
  danger:            '#DC2626',
  ph:                '#7C3AED',
  turbidity:         '#0284C7',
  tds:               '#0891B2',
  waterLevel:        '#16A34A',
  tabBar:            '#FFFFFF',
  tabBorder:         '#E2E8F0',
  modalOverlay:      'rgba(0,0,0,0.5)',
  alertBg:           '#FFF1F2',
  filterBannerBg:    '#F0FDF4',
  filterBannerBorder:'#BBF7D0',
  ackBtnBg:          '#F0FDF4',
};

const DARK: ThemeColors = {
  isDark: true,
  bg:                '#0B1A10',
  card:              '#122819',
  cardAlt:           '#193524',
  primary:           '#22C55E',
  primaryDeep:       '#16A34A',
  text:              '#F0FDF4',
  muted:             '#86EFAC',
  border:            '#1A3A24',
  inputBg:           '#0A1A0F',
  success:           '#22C55E',
  warning:           '#F59E0B',
  danger:            '#EF4444',
  ph:                '#A78BFA',
  turbidity:         '#38BDF8',
  tds:               '#22D3EE',
  waterLevel:        '#22C55E',
  tabBar:            '#122819',
  tabBorder:         '#1A3A24',
  modalOverlay:      'rgba(0,0,0,0.85)',
  alertBg:           '#1A0808',
  filterBannerBg:    '#0A1A10',
  filterBannerBorder:'#1A3A24',
  ackBtnBg:          '#0A1A10',
};

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState<boolean>(false); // light mode default for thesis demo

  useEffect(() => {
    AsyncStorage.getItem('theme').then((saved) => {
      if (saved !== null) setIsDark(saved === 'dark');
    });
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ colors: isDark ? DARK : LIGHT, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};