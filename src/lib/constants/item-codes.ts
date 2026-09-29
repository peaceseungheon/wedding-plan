// PRD 10.2 표준 항목 체계. 견적 항목(quote_items.itemCode)과
// 참가격 기준선(price_benchmarks.itemCode)이 공유하는 표준 코드다.
export const ITEM_CODES = [
  "HALL_RENTAL",
  "MEAL",
  "FLOWER",
  "BEVERAGE",
  "CEREMONY_PHOTO",
  "STUDIO_BASE",
  "ORIGINAL_FILE",
  "ALBUM_EXTRA",
  "DRESS_BASE",
  "DRESS_UPGRADE",
  "HELPER",
  "MAKEUP_BASE",
  "MAKEUP_EXTRA_PERSON",
  "DISCOUNT",
  "VAT",
  "DELIVERY",
  "ETC",
] as const;

export type ItemCode = (typeof ITEM_CODES)[number];

// Record<ItemCode, string>이라 코드 추가 시 라벨 누락이 컴파일 오류로 잡힌다.
export const ITEM_CODE_LABELS: Readonly<Record<ItemCode, string>> = {
  HALL_RENTAL: "대관료",
  MEAL: "식대",
  FLOWER: "꽃",
  BEVERAGE: "음료",
  CEREMONY_PHOTO: "예식+스냅",
  STUDIO_BASE: "스튜디오 기본",
  ORIGINAL_FILE: "원본",
  ALBUM_EXTRA: "앨범 추가",
  DRESS_BASE: "드레스 기본",
  DRESS_UPGRADE: "드레스 업그레이드",
  HELPER: "헬퍼",
  MAKEUP_BASE: "메이크업 기본",
  MAKEUP_EXTRA_PERSON: "추가 인원",
  DISCOUNT: "할인",
  VAT: "부가세",
  DELIVERY: "배송",
  ETC: "기타",
};
