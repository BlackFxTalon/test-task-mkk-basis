export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'notes-theme';

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

const applyTheme = (theme: ThemeMode): void => {
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme;
  document.documentElement.dataset.theme = theme;
};

export const useTheme = () => {
  const theme = useState<ThemeMode>('theme-mode', () => 'system');
  const initialized = useState<boolean>('theme-initialized', () => false);

  onMounted(() => {
    if (initialized.value) return;

    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      theme.value = isThemeMode(storedTheme) ? storedTheme : 'system';
    } catch {
      theme.value = 'system';
    }

    applyTheme(theme.value);
    initialized.value = true;
  });

  const setTheme = (nextTheme: ThemeMode): void => {
    theme.value = nextTheme;
    applyTheme(nextTheme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
  };

  return {
    theme: readonly(theme),
    setTheme,
  };
};
