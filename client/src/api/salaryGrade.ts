/**
 * 薪级薪档 API（M5-2-C1）
 * @module api/salaryGrade
 * @description 消费 /api/salary/grades + /grade-levels 4 端点；0 新增后端端点
 * @permission salary:grade:read / salary:grade:write（5 角色无 finance）
 */

import http from './http';
import type { PaginatedResponse } from './types';
import { unwrapData } from './types/organization';
import {
  unwrapSalaryPage,
  type CreateGradeLevelRequest,
  type CreateSalaryGradeRequest,
  type ListGradeLevelFilter,
  type ListSalaryGradeFilter,
  type SalaryGrade,
  type SalaryGradeLevel,
} from './types/salary';

export const SALARY_GRADE_PATHS = {
  grades: '/salary/grades',
  gradeLevels: '/salary/grade-levels',
} as const;

/** GET /salary/grades · salary:grade:read */
export async function listGrades(
  filter: ListSalaryGradeFilter = {},
): Promise<PaginatedResponse<SalaryGrade>> {
  return unwrapSalaryPage<SalaryGrade>(
    await http.get(SALARY_GRADE_PATHS.grades, { params: filter }),
  );
}

/** POST /salary/grades · salary:grade:write */
export async function createGrade(data: CreateSalaryGradeRequest): Promise<SalaryGrade> {
  return unwrapData<SalaryGrade>(await http.post(SALARY_GRADE_PATHS.grades, data));
}

/** GET /salary/grade-levels · salary:grade:read */
export async function listGradeLevels(
  filter: ListGradeLevelFilter = {},
): Promise<PaginatedResponse<SalaryGradeLevel>> {
  return unwrapSalaryPage<SalaryGradeLevel>(
    await http.get(SALARY_GRADE_PATHS.gradeLevels, { params: filter }),
  );
}

/** POST /salary/grade-levels · salary:grade:write */
export async function createGradeLevel(
  data: CreateGradeLevelRequest,
): Promise<SalaryGradeLevel> {
  return unwrapData<SalaryGradeLevel>(
    await http.post(SALARY_GRADE_PATHS.gradeLevels, data),
  );
}
