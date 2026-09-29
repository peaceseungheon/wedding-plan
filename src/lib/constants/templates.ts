// 프로젝트 생성 시 자동 주입되는 예산 카테고리/체크리스트 템플릿(PRD 6.1 첫 설정).
// 템플릿은 전역 기본값이고, 실제 저장은 프로젝트 생성 API가 budget_categories/tasks 행으로
// 복제한다(스키마상 두 모델은 projectId를 필수로 갖므로 시드가 아닌 생성 시점에 넣는다).

export interface BudgetTemplateGroup {
  readonly name: string;
  readonly children: readonly string[];
}

export const BUDGET_CATEGORY_TEMPLATE: readonly BudgetTemplateGroup[] = [
  { name: "웨딩홀", children: ["대관", "식사", "옵션"] },
  { name: "스드메", children: ["스튜디오", "드레스", "메이크업"] },
  { name: "기타", children: ["예식물품", "기타"] },
];

export interface BudgetTemplateLeaf {
  readonly name: string;
  readonly group: string;
  readonly sortOrder: number;
}

// budget_categories는 계층 없는 평면 모델(@@unique([projectId, name]))이라
// 하위 항목만 행으로 복제한다. 그룹명(웨딩홀/스드메/기타)은 UI 표시용 메타데이터.
const budgetLeaves = BUDGET_CATEGORY_TEMPLATE.flatMap((group) =>
  group.children.map((name) => ({ name, group: group.name })),
);

export const BUDGET_CATEGORY_LEAVES: readonly BudgetTemplateLeaf[] = budgetLeaves.map(
  (leaf, index) => ({ ...leaf, sortOrder: index + 1 }),
);

export interface ChecklistTemplateItem {
  readonly title: string;
  /** 예식일 기준 선행 개월 수. 0 = 당일. */
  readonly dueOffsetMonths: number;
  readonly sortOrder: number;
}

export const CHECKLIST_TEMPLATE: readonly ChecklistTemplateItem[] = [
  { title: "웨딩홀 예약", dueOffsetMonths: 6, sortOrder: 1 },
  { title: "스드메 업체 예약", dueOffsetMonths: 5, sortOrder: 2 },
  { title: "드레스·예복 선택", dueOffsetMonths: 4, sortOrder: 3 },
  { title: "메이크업·헤어 테스트", dueOffsetMonths: 3, sortOrder: 4 },
  { title: "하객 명단 초안 작성", dueOffsetMonths: 3, sortOrder: 5 },
  { title: "청첩장 제작", dueOffsetMonths: 2, sortOrder: 6 },
  { title: "청첩장 발송", dueOffsetMonths: 2, sortOrder: 7 },
  { title: "예식 물품 준비", dueOffsetMonths: 1, sortOrder: 8 },
  { title: "혼주 복장 준비", dueOffsetMonths: 1, sortOrder: 9 },
  { title: "결제 일정 최종 점검", dueOffsetMonths: 1, sortOrder: 10 },
  { title: "예식 리허설", dueOffsetMonths: 0, sortOrder: 11 },
  { title: "당일 준비물 확인", dueOffsetMonths: 0, sortOrder: 12 },
];
