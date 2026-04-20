import { useEffect, useState } from 'react';

const LS_KEY = 'reading_streak_days';

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadDays(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveDays(days: string[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(days));
  } catch { /* ignore */ }
}

function computeStreak(days: string[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let streak = 0;
  const today = new Date();
  // Start from today; if not in set, start from yesterday (allow missing today so
  // the flame doesn't reset until a full missed day has passed)
  const probe = new Date(today);
  if (!set.has(toDateKey(probe))) {
    probe.setDate(probe.getDate() - 1);
    if (!set.has(toDateKey(probe))) return 0;
  }
  while (set.has(toDateKey(probe))) {
    streak += 1;
    probe.setDate(probe.getDate() - 1);
  }
  return streak;
}

/** Tracks consecutive-day reading streak. Returns current streak count.
 *  Call `markReadToday()` when user starts a reading session (e.g. opens a paper). */
export function useReadingStreak() {
  const [streak, setStreak] = useState<number>(() => computeStreak(loadDays()));

  const markReadToday = () => {
    const key = toDateKey(new Date());
    const days = loadDays();
    if (!days.includes(key)) {
      days.push(key);
      // Keep last 365 days at most
      if (days.length > 365) days.splice(0, days.length - 365);
      saveDays(days);
      setStreak(computeStreak(days));
    }
  };

  // Recompute on mount and at midnight (so flame updates if user leaves app open)
  useEffect(() => {
    setStreak(computeStreak(loadDays()));
    const id = window.setInterval(() => setStreak(computeStreak(loadDays())), 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  return { streak, markReadToday };
}
