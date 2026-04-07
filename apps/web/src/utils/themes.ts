export const themeOptions = [
  { code: 'mango-splash', name: '芒果冲浪' },
  { code: 'berry-pop', name: '莓莓汽泡' },
  { code: 'neon-pulse', name: '电光霓虹' },
] as const;

export type ThemeCode = (typeof themeOptions)[number]['code'];

export const defaultTheme: ThemeCode = 'mango-splash';

export function isThemeCode(value: string | null | undefined): value is ThemeCode {
  if (!value) {
    return false;
  }
  return themeOptions.some((item) => item.code === value);
}
