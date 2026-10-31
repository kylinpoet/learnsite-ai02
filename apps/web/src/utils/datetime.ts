type FormatDateTimeOptions = {
  fallback?: string;
  sliceStart?: number;
  sliceEnd?: number;
};

export function formatDateTime(
  value: string | null | undefined,
  options: FormatDateTimeOptions = {},
): string {
  const { fallback = '暂无记录', sliceStart = 0, sliceEnd = 16 } = options;
  if (!value) {
    return fallback;
  }
  return value.replace('T', ' ').slice(sliceStart, sliceEnd);
}
