export const themeOptions = [
  { code: 'sky', name: '晴空蓝' },
  { code: 'forest', name: '森林绿' },
  { code: 'citrus', name: '活力橙' },
  { code: 'blossom', name: '樱花粉' },
  { code: 'night', name: '星夜蓝' },
] as const;

export type ThemeCode = (typeof themeOptions)[number]['code'];

export const defaultTheme: ThemeCode = 'sky';

export function isThemeCode(value: string | null | undefined): value is ThemeCode {
  if (!value) {
    return false;
  }
  return themeOptions.some((item) => item.code === value);
}
