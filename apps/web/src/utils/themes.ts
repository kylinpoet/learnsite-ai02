export const themeOptions = [
  { code: 'emblem', name: '墨绿画布' },
  { code: 'growth', name: '科目色谱' },
  { code: 'clay', name: '粘土童趣' },
] as const;

export type ThemeCode = (typeof themeOptions)[number]['code'];

export const defaultTheme: ThemeCode = 'emblem';

export function isThemeCode(value: string | null | undefined): value is ThemeCode {
  if (!value) {
    return false;
  }
  return themeOptions.some((item) => item.code === value);
}
