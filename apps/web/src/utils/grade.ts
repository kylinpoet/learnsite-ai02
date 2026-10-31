/**
 * 年级与届别的显示格式。
 *
 * 初中三年制：七年级(7) ~ 九年级(9)。班级「跟届走」——入学年份（届）是学生的稳定身份，
 * 年级会随升班变化，因此展示年级时一律走这里的格式化，避免各处内联拼接出现
 * 「7 年级」「七年级」「初一」混用。
 */

const GRADE_LABELS: Record<number, string> = {
  7: '七年级',
  8: '八年级',
  9: '九年级',
};

/** 初中学段年级范围：七年级(7) ~ 九年级(9)。 */
export const MIN_GRADE_NO = 7;
export const MAX_GRADE_NO = 9;

/** 按校历推算当前学年：9 月开学进入新学年，之前仍属上一学年。 */
export function currentSchoolYear(): number {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * 由入学年份推导年级：入学当年即七年级。
 * 与后端 app/services/class_cohort.py 的 resolve_grade_no 保持一致。
 */
export function resolveGradeNo(entryYear: number, schoolYear = currentSchoolYear()): number {
  return schoolYear - entryYear + MIN_GRADE_NO;
}

/** 年级的中文写法，例如 7 → 七年级；超出初中范围时回退成「7 年级」。 */
export function formatGrade(gradeNo: number | null | undefined, fallback = '--'): string {
  if (gradeNo === null || gradeNo === undefined) {
    return fallback;
  }
  return GRADE_LABELS[gradeNo] ?? `${gradeNo} 年级`;
}

/** 届别的写法，例如 2026 → 2026届。 */
export function formatCohort(entryYear: number | null | undefined, fallback = '--'): string {
  if (entryYear === null || entryYear === undefined) {
    return fallback;
  }
  return `${entryYear}届`;
}

/**
 * 带届别的班级标签，例如「701班 · 2026届」。
 * 班级跟届走后同一班号可以跨届并存，班级列表与选择器用它区分。
 */
export function formatClassLabel(
  className: string,
  entryYear: number | null | undefined,
): string {
  if (!entryYear) {
    return className;
  }
  return `${className} · ${formatCohort(entryYear)}`;
}
