import { useCallback, useEffect, useState } from 'react';

type TimeMode = 'morning' | 'day' | 'evening' | 'night';
function computeTimeMode(): TimeMode {
  const h = new Date().getHours();
  if (h >= 6 && h < 11)  return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/** Observes the wall-clock hour and syncs `<html data-time-mode>` so CSS can
 *  adjust ambient colors to match morning/day/evening/night. */
export function useTimeOfDayTint() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.timeMode = computeTimeMode();
    };
    apply();
    const id = window.setInterval(apply, 5 * 60 * 1000); // re-check every 5 min
    return () => window.clearInterval(id);
  }, []);
}

export type Theme = 'magic' | 'sepia' | 'midnight' | 'moss';
export type FontSize = 'sm' | 'md' | 'lg';

const LS_THEME = 'app_theme';
const LS_FONTSIZE = 'app_fontsize';
const LS_TWO_PAGE = 'app_two_page';

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** Central hook for user-facing display prefs: theme, font size, two-page mode.
 *  Applies CSS side-effects (html attrs + custom properties) so styles follow. */
export function useAppPrefs() {
  const [theme, setThemeState] = useState<Theme>(() => readLS(LS_THEME, 'magic' as Theme));
  const [fontSize, setFontSizeState] = useState<FontSize>(() => readLS(LS_FONTSIZE, 'md' as FontSize));
  const [twoPage, setTwoPageState] = useState<boolean>(() => readLS(LS_TWO_PAGE, false));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS_THEME, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    const rem = fontSize === 'sm' ? 0.9 : fontSize === 'lg' ? 1.15 : 1;
    document.documentElement.style.setProperty('--reader-scale', String(rem));
    localStorage.setItem(LS_FONTSIZE, JSON.stringify(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(LS_TWO_PAGE, JSON.stringify(twoPage));
  }, [twoPage]);

  const cycleFontSize = useCallback(() => {
    setFontSizeState((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'));
  }, []);

  return {
    theme, setTheme: setThemeState,
    fontSize, setFontSize: setFontSizeState, cycleFontSize,
    twoPage, setTwoPage: setTwoPageState,
  };
}

export const THEME_LABELS: Record<Theme, { name: string; emoji: string; hint: string }> = {
  magic: { name: '魔法紫', emoji: '🦄', hint: '紫粉玫瑰渐变（默认）' },
  sepia: { name: '羊皮纸', emoji: '📜', hint: '暖棕色泛黄，适合长时间阅读' },
  midnight: { name: '午夜蓝', emoji: '🌙', hint: '深紫蓝星空，夜间护眼' },
  moss: { name: '苔藓绿', emoji: '🌿', hint: '清淡森林色，清晨模式' },
};
