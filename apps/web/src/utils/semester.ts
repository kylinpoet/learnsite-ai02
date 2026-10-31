/**
 * 学年与学期的显示格式。
 *
 * 每学年固定两个学期：第一学期（9 月 ~ 次年 1 月）、第二学期（次年 2 月 ~ 8 月）。
 * 学期用一个稳定标识承载（如 "2026-1"），学案建好即冻结所属学期，
 * 因此展示一律走这里的格式化，避免各处内联拼接。
 *
 * 与后端 app/services/semester.py 的规则保持一致。
 */

export const MIN_SEMESTER_NO = 1;
export const MAX_SEMESTER_NO = 2;

const SEMESTER_LABELS: Record<number, string> = {
  1: '第一学期',
  2: '第二学期',
};

export const UNASSIGNED_SEMESTER_LABEL = '未归属学期';

/** 按校历推算当前学年：9 月开学进入新学年。 */
export function currentSemesterSchoolYear(): number {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/** 按校历推算当前学期序号：9~12 月与 1 月为第一学期，其余为第二学期。 */
export function currentSemesterNo(): number {
  const month = new Date().getMonth() + 1;
  return month >= 9 || month === 1 ? 1 : 2;
}

/** 学期序号的中文写法，例如 1 → 第一学期；非法值回退成「未归属学期」。 */
export function formatSemesterNo(semesterNo: number | null | undefined): string {
  if (semesterNo === null || semesterNo === undefined) {
    return UNASSIGNED_SEMESTER_LABEL;
  }
  return SEMESTER_LABELS[semesterNo] ?? UNASSIGNED_SEMESTER_LABEL;
}

/** 学期的完整写法，例如 (2026, 1) → 2026学年第一学期。 */
export function formatSemesterLabel(
  schoolYear: number | null | undefined,
  semesterNo: number | null | undefined,
): string {
  if (!schoolYear || !SEMESTER_LABELS[semesterNo as number]) {
    return UNASSIGNED_SEMESTER_LABEL;
  }
  return `${schoolYear}学年${SEMESTER_LABELS[semesterNo as number]}`;
}

/** 由学期标识得到完整写法，例如 "2026-1" → 2026学年第一学期。 */
export function formatSemesterKeyLabel(semesterKey: string | null | undefined): string {
  if (!semesterKey) {
    return UNASSIGNED_SEMESTER_LABEL;
  }
  const [yearText, semesterText] = semesterKey.split('-');
  const schoolYear = Number(yearText);
  const semesterNo = Number(semesterText);
  if (!Number.isFinite(schoolYear) || !SEMESTER_LABELS[semesterNo]) {
    return UNASSIGNED_SEMESTER_LABEL;
  }
  return formatSemesterLabel(schoolYear, semesterNo);
}

/** 由学年与学期序号拼出学期标识，例如 (2026, 1) → "2026-1"。 */
export function formatSemesterKey(schoolYear: number, semesterNo: number): string {
  return `${schoolYear}-${semesterNo}`;
}

/** 供下拉选择的学期选项。 */
export function semesterOptions() {
  return [
    { label: SEMESTER_LABELS[1], value: 1 },
    { label: SEMESTER_LABELS[2], value: 2 },
  ];
}
