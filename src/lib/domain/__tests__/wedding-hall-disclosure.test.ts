import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseWeddingHallDisclosure,
  type WeddingHallPriceItem,
} from "@/lib/domain/wedding-hall-disclosure";

/** fixtures/ 아래 xlsx를 읽어 Buffer로 돌려준다. */
function loadFixture(name: string): Buffer {
  return readFileSync(path.resolve(process.cwd(), "src/lib/domain/__tests__/fixtures", name));
}

/** 조건에 맞는 항목 전체를 찾는다. itemGroup을 명시하지 않으면 이름만 본다. */
function findItems(
  items: readonly WeddingHallPriceItem[],
  hallName: string,
  itemName: string,
  itemGroup?: string | null,
): WeddingHallPriceItem[] {
  return items.filter(
    (item) =>
      item.hallName === hallName &&
      item.itemName === itemName &&
      (itemGroup === undefined || item.itemGroup === itemGroup),
  );
}

/** 조건에 맞는 항목이 정확히 1개임을 확인하고 돌려준다. */
function findOne(
  items: readonly WeddingHallPriceItem[],
  hallName: string,
  itemName: string,
  itemGroup?: string | null,
): WeddingHallPriceItem {
  const found = findItems(items, hallName, itemName, itemGroup);
  expect(found, `${hallName}/${itemGroup ?? "_"}/${itemName} 항목이 정확히 1개여야 한다`).toHaveLength(1);
  return found[0]!;
}

describe("parseWeddingHallDisclosure 그래머시 코엑스 (페어 컬럼형)", () => {
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("gramercy_coex.xlsx"));

  it("업체명을 추출한다(아이콘·별표 제거)", async () => {
    expect((await disclosure()).venueName).toBe("그래머시 코엑스");
  });

  it("홀 블록을 나눈다(선행 공백 정리)", async () => {
    expect((await disclosure()).halls).toEqual(["그랜드볼룸 (1F)", "아셈볼룸 (2F)"]);
  });

  it("홀별 9개, 총 18개 가격 항목을 뽑는다", async () => {
    const { priceItems, halls } = await disclosure();
    expect(priceItems).toHaveLength(18);
    for (const hall of halls) {
      expect(priceItems.filter((item) => item.hallName === hall)).toHaveLength(9);
    }
  });

  it("보증인원은 가격 없이 텍스트로 저장한다", async () => {
    const { priceItems } = await disclosure();
    const grand = findOne(priceItems, "그랜드볼룸 (1F)", "500명이상", "보증인원");
    expect(grand.priceMin).toBeNull();
    expect(grand.priceMax).toBeNull();
    findOne(priceItems, "아셈볼룸 (2F)", "300명이상", "보증인원");
  });

  it("식대는 단일 무명 세그먼트로 헤더명 항목이 된다", async () => {
    const { priceItems } = await disclosure();
    for (const hall of ["그랜드볼룸 (1F)", "아셈볼룸 (2F)"]) {
      const meal = findOne(priceItems, hall, "식대", null);
      expect(meal.priceMin).toBe(85_000);
      expect(meal.priceMax).toBe(130_000);
    }
  });

  it("페어 컬럼(연출료, 장식비)을 홀마다 파싱한다", async () => {
    const { priceItems } = await disclosure();
    const grandDirection = findOne(priceItems, "그랜드볼룸 (1F)", "연출료", "연출료, 장식비");
    expect(grandDirection.priceMin).toBe(4_200_000);
    expect(grandDirection.priceMax).toBe(4_200_000);

    const grandFlower = findOne(priceItems, "그랜드볼룸 (1F)", "플라워", "연출료, 장식비");
    expect(grandFlower.priceMin).toBe(7_000_000);
    expect(grandFlower.priceMax).toBeNull();

    const assemblyDirection = findOne(priceItems, "아셈볼룸 (2F)", "연출료", "연출료, 장식비");
    expect(assemblyDirection.priceMin).toBe(3_000_000);

    const assemblyFlower = findOne(priceItems, "아셈볼룸 (2F)", "플라워", "연출료, 장식비");
    expect(assemblyFlower.priceMin).toBe(5_000_000);
    expect(assemblyFlower.priceMax).toBeNull();
  });

  it("식음료 추가는 명명 세그먼트 3건으로 나뉜다(양 홀 공통)", async () => {
    const { priceItems } = await disclosure();
    for (const hall of ["그랜드볼룸 (1F)", "아셈볼룸 (2F)"]) {
      expect(findItems(priceItems, hall, "와인", "식음료 추가")).toHaveLength(1);
      const beer = findOne(priceItems, hall, "맥주&소주", "식음료 추가");
      expect(beer.priceMin).toBe(9_000);
      const soft = findOne(priceItems, hall, "소프트드링크", "식음료 추가");
      expect(soft.priceMin).toBe(6_000);
    }
  });

  it("기타 옵션 멀티라인 세그먼트를 파싱한다", async () => {
    const { priceItems } = await disclosure();
    const piano = findOne(priceItems, "그랜드볼룸 (1F)", "피아노 3중주 (1부)", "기타 옵션");
    expect(piano.priceMin).toBe(370_000);
    expect(piano.priceMax).toBe(370_000);
    const tteok = findOne(priceItems, "그랜드볼룸 (1F)", "식전떡", "기타 옵션");
    expect(tteok.priceMin).toBe(4_000);
  });

  it("'-'이나 빈 셀은 항목을 만들지 않는다", async () => {
    const { priceItems } = await disclosure();
    expect(priceItems.some((item) => item.itemName === "행사 진행")).toBe(false);
    expect(priceItems.some((item) => item.itemName === "영상 촬영")).toBe(false);
    expect(priceItems.some((item) => item.itemName === "사진 촬영")).toBe(false);
  });

  it("위약금 정책 7건을 기간·내용 쌍으로 뽑는다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies).toHaveLength(7);
    expect(refundPolicies[0]).toMatchObject({
      periodText: "계약 체결 후 14일이내 -행사일로부터 150일 이전 취소 시",
      ruleText: "계약금의 100% 환급 (150일 이전 사전 시식 시 식사금액 제외 후 계약금 환급)",
    });
    expect(refundPolicies[6]).toMatchObject({
      periodText: "행사일 당일 취소 시",
      ruleText: "이용자는 계약금 전액 및 총 비용의 50% 위약금 발생",
    });
  });

  it("각주('*총비용...')는 정책에서 제외한다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies.some((p) => p.periodText.startsWith("*"))).toBe(false);
  });
});

describe("parseWeddingHallDisclosure 플로팅아일랜드 (거대 정책셀형)", () => {
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("floating_island.xlsx"));

  it("업체명을 추출한다(PUA 아이콘 제거)", async () => {
    expect((await disclosure()).venueName).toBe("㈜플로팅아일랜드");
  });

  it("홀 블록을 나눈다", async () => {
    expect((await disclosure()).halls).toEqual(["컨벤션홀", "야외예식장(기타)"]);
  });

  it("총 25개 항목(컨벤션홀 14, 야외 11)을 뽑는다", async () => {
    const { priceItems } = await disclosure();
    expect(priceItems).toHaveLength(25);
    expect(priceItems.filter((item) => item.hallName === "컨벤션홀")).toHaveLength(14);
    expect(priceItems.filter((item) => item.hallName === "야외예식장(기타)")).toHaveLength(11);
  });

  it("식비 페어는 라벨을 데이터행에서 가져온다", async () => {
    const { priceItems } = await disclosure();
    const basic = findOne(priceItems, "컨벤션홀", "기본300명", "식비");
    expect(basic.priceMin).toBe(99_000);
    expect(basic.priceMax).toBe(132_000);
    const extra = findOne(priceItems, "컨벤션홀", "추가 1명당", "식비");
    expect(extra.priceMin).toBe(99_000);
    expect(extra.priceMax).toBe(132_000);
    const perHead = findOne(priceItems, "야외예식장(기타)", "1명당", "식비");
    expect(perHead.priceMax).toBe(132_000);
  });

  it("가격 없는 페어 라벨('- (인원 제한 없음)')은 스킵한다", async () => {
    const { priceItems } = await disclosure();
    expect(priceItems.some((item) => item.itemName.includes("인원 제한"))).toBe(false);
  });

  it("대관료, 장식비 페어를 홀별로 파싱한다", async () => {
    const { priceItems } = await disclosure();
    const rent = findOne(priceItems, "컨벤션홀", "대관", "대관료, 장식비");
    expect(rent.priceMin).toBe(5_500_000);
    const deco = findOne(priceItems, "컨벤션홀", "장식비(연출포함)", "대관료, 장식비");
    expect(deco.priceMin).toBe(11_000_000);
    const outdoorRent = findOne(priceItems, "야외예식장(기타)", "대관", "대관료, 장식비");
    expect(outdoorRent.priceMin).toBe(3_300_000);
    const outdoorDeco = findOne(priceItems, "야외예식장(기타)", "장식비(연출포함)", "대관료, 장식비");
    expect(outdoorDeco.priceMin).toBe(10_450_000);
  });

  it("폐백 열은 라벨 없는 가격 셀이라 헤더명 항목이 된다(양 홀)", async () => {
    const { priceItems } = await disclosure();
    for (const hall of ["컨벤션홀", "야외예식장(기타)"]) {
      const pyebaek = findOne(priceItems, hall, "폐백", null);
      expect(pyebaek.priceMin).toBe(440_000);
    }
  });

  it("무명 단일 세그먼트는 헤더명 항목이 된다", async () => {
    const { priceItems } = await disclosure();
    const drink = findOne(priceItems, "컨벤션홀", "식음료 추가", null);
    expect(drink.priceMin).toBe(7_700);
    expect(drink.priceMax).toBe(8_800);
    findOne(priceItems, "컨벤션홀", "장식 추가", null);
    const video = findOne(priceItems, "컨벤션홀", "영상 촬영", null);
    expect(video.priceMin).toBe(770_000);
    expect(video.priceMax).toBe(880_000);
    const photo = findOne(priceItems, "컨벤션홀", "사진 촬영", null);
    expect(photo.priceMin).toBe(1_650_000);
  });

  it("기타 옵션 세그먼트 5종을 파싱한다", async () => {
    const { priceItems } = await disclosure();
    const mc = findOne(priceItems, "컨벤션홀", "주례비", "기타 옵션");
    expect(mc.priceMin).toBeNull();
    expect(mc.priceMax).toBeNull();
    const host = findOne(priceItems, "컨벤션홀", "본식사회자", "기타 옵션");
    expect(host.priceMin).toBe(150_000);
    expect(host.priceMax).toBe(250_000);
    const banner = findOne(priceItems, "컨벤션홀", "현수막", "기타 옵션");
    expect(banner.priceMin).toBe(1_650_000);
    const flag = findOne(priceItems, "컨벤션홀", "깃발", "기타 옵션");
    expect(flag.priceMin).toBe(770_000);
    const bouquet = findOne(priceItems, "컨벤션홀", "부케", "기타 옵션");
    expect(bouquet.priceMin).toBe(200_000);
    expect(bouquet.priceMax).toBe(250_000);
  });

  it("거대 정책셀을 콜론 분할로 6건 뽑는다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies).toHaveLength(6);
    expect(refundPolicies[0]).toMatchObject({
      periodText: "결혼식 진행일로부터 150일 이내",
      ruleText: "계약서 상 총 결제금액의 10%",
    });
    expect(refundPolicies[5]).toMatchObject({
      periodText: "결혼식 진행일로부터 7일 이내",
      ruleText: "계약서상 총 결제금액의 100%",
    });
  });

  it("주석('※') 라인은 정책에서 제외한다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies.some((p) => p.ruleText.includes("위약금 산정 기준은"))).toBe(false);
  });
});

describe("parseWeddingHallDisclosure 더컨벤션 (통합 시트형)", () => {
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("the_convention.xlsx"));

  it("col2에 있는 업체명을 추출한다", async () => {
    expect((await disclosure()).venueName).toBe("더컨벤션 반포((유)제이더블유반포)");
  });

  it("col3의 예식홀명 열을 홀로 인식한다", async () => {
    expect((await disclosure()).halls).toEqual(["그랜드볼룸"]);
  });

  it("식비·대관료 페어와 기타 옵션 직접 컬럼을 파싱한다", async () => {
    const { priceItems } = await disclosure();
    expect(priceItems).toHaveLength(3);
    const meal = findOne(priceItems, "그랜드볼룸", "기본 300명", "식비");
    expect(meal.priceMin).toBe(50_000);
    expect(meal.priceMax).toBe(89_000);
    const rental = findOne(priceItems, "그랜드볼룸", "대관정가 : 12,000,000원", "대관료, 장식비");
    expect(rental.priceMin).toBe(2_000_000);
    expect(rental.priceMax).toBe(8_500_000);
    const dvd = findOne(priceItems, "그랜드볼룸", "본식 DVD", "기타 옵션");
    expect(dvd.priceMin).toBe(550_000);
    expect(dvd.priceMax).toBe(550_000);
  });

  it("정책 없음(주석만 있는 시트)은 빈 배열을 돌려준다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies).toEqual([]);
  });
});

describe("parseWeddingHallDisclosure 캠퍼트리 (구형 .xls·단위 승수)", () => {
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("camp_tree.xls"));

  it("업체명과 홀 5개를 읽는다", async () => {
    const d = await disclosure();
    expect(d.venueName).toBe("캠퍼트리 호텔 앤 리조트");
    expect(d.halls).toEqual([
      "탐라홀",
      "야외가든",
      "더테라스",
      "더뷰",
      "프레지덴셜 스위트\n(저녁예식+10인숙박)",
    ]);
  });

  it("천원/만원 단위 가격에 승수를 적용해 원 단위로 정규화한다", async () => {
    const { priceItems } = await disclosure();
    const basic = findOne(priceItems, "탐라홀", "기본 300명~1000명", "식비");
    expect(basic.priceMin).toBe(58000);
    expect(basic.priceMax).toBe(78000);
    const rental = findOne(priceItems, "탐라홀", "대관", "대관료, 장식비");
    expect(rental.priceMin).toBe(2000000);
    expect(rental.priceMax).toBe(2000000);
    expect(findOne(priceItems, "탐라홀", "장식비", "대관료, 장식비").priceMin).toBe(1900000);
  });

  it("블록별 선택품목과 나머지 홀 가격을 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(findOne(priceItems, "탐라홀", "주류", "식음료 추가").priceMin).toBe(8000);
    expect(findOne(priceItems, "탐라홀", "음료", "식음료 추가").priceMin).toBe(4000);
    expect(findOne(priceItems, "더뷰", "장식비", "대관료, 장식비").priceMin).toBe(2430000);
    expect(
      findOne(priceItems, "프레지덴셜 스위트\n(저녁예식+10인숙박)", "대관", "대관료, 장식비").priceMin,
    ).toBe(3300000);
    expect(findOne(priceItems, "더테라스", "기본 30명~100명", "식비").priceMin).toBe(95000);
    expect(priceItems).toHaveLength(30);
  });

  it("콜론 없는 단일 정책 라인을 periodText로 저장한다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies).toHaveLength(1);
    expect(refundPolicies[0]?.periodText).toBe(
      "소비자분쟁해결기준과 동일, 위약금 산정 기준은 소비자 귀책사유 시에만 적용",
    );
    expect(refundPolicies[0]?.ruleText).toBe("");
  });
});

describe("parseWeddingHallDisclosure 아르베 (변형 B)", () => {
  /** 아르베 웨딩홀: 다중 서브테이블 + 성수기/비수기 이중 가격 + 시즌별 표 중복 형식. */
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("arbe.xlsx"));

  it("업체명과 홀을 읽는다", async () => {
    const d = await disclosure();
    expect(d.venueName).toBe("아르베 웨딩홀");
    expect(d.halls).toEqual(["라피네홀"]);
  });

  it("시즌1 성수기/비수기 가격을 구분해 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(
      findOne(priceItems, "라피네홀", "대관료 (성수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 1월~8월)").priceMin,
    ).toBe(7500000);
    expect(
      findOne(priceItems, "라피네홀", "대관료 (비수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 1월~8월)").priceMin,
    ).toBe(2000000);
    const flower = findItems(
      priceItems,
      "라피네홀",
      "꽃장식 (성수기)",
      "대관료 / 꽃장식 / 부페가 (기준: 2027년 1월~8월)",
    );
    expect(flower).toHaveLength(1);
    expect(flower[0]?.priceMin).toBeNull();
    expect(flower[0]?.rawValue).toBe("대관료에 포함");
    expect(findOne(priceItems, "라피네홀", "부페가격 (성수기)", "부페가격 (기준: 2027년 1월~8월)").priceMin).toBe(75000);
    expect(findOne(priceItems, "라피네홀", "부페가격 (비수기)", "부페가격 (기준: 2027년 1월~8월)").priceMin).toBe(60000);
  });

  it("시즌2 가격을 별도 기준 라벨로 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(
      findOne(priceItems, "라피네홀", "대관료 (성수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 9월~12월)").priceMin,
    ).toBe(8500000);
    expect(
      findOne(priceItems, "라피네홀", "대관료 (비수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 9월~12월)").priceMin,
    ).toBe(4000000);
    expect(findOne(priceItems, "라피네홀", "부페가격 (성수기)", "부페가격 (기준: 2027년 9월~12월)").priceMin).toBe(85000);
    expect(findOne(priceItems, "라피네홀", "부페가격 (비수기)", "부페가격 (기준: 2027년 9월~12월)").priceMin).toBe(65000);
  });

  it("주요선택품목 서브테이블을 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(findOne(priceItems, "라피네홀", "본식촬영", null).priceMin).toBe(990000);
    expect(findOne(priceItems, "라피네홀", "영상촬영", null).priceMin).toBe(770000);
    expect(findOne(priceItems, "라피네홀", "사회자(1인)", null).priceMin).toBe(440000);
    expect(findOne(priceItems, "라피네홀", "축가(1인)", null).priceMin).toBe(440000);
    expect(findOne(priceItems, "라피네홀", "부페가포함", "음.주류").priceMin).toBeNull();
  });

  it("기타옵션 거대 셀의 멀티라인 가격을 모두 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(findOne(priceItems, "라피네홀", "본식촬영", "기타옵션").priceMin).toBe(990000);
    expect(findOne(priceItems, "라피네홀", "아이폰스냅", "기타옵션").priceMin).toBe(440000);
    expect(findOne(priceItems, "라피네홀", "혼주미용 여", "기타옵션").priceMin).toBe(220000);
    expect(findOne(priceItems, "라피네홀", "남", "기타옵션").priceMin).toBe(66000);
    expect(findOne(priceItems, "라피네홀", "사회(주례有)", "기타옵션").priceMin).toBe(330000);
    expect(findOne(priceItems, "라피네홀", "사회(주례無)", "기타옵션").priceMin).toBe(440000);
    expect(findOne(priceItems, "라피네홀", "플라워샤워", "기타옵션").priceMin).toBe(330000);
    expect(findOne(priceItems, "라피네홀", "웰컴드링크", "기타옵션").priceMin).toBe(660000);
    const options = priceItems.filter(
      (item) => item.hallName === "라피네홀" && item.itemGroup === "기타옵션",
    );
    expect(options).toHaveLength(12);
  });

  it("콜론 위약금 정책 5건을 읽고 결혼준비대행업 섹션은 무시한다", async () => {
    const { refundPolicies } = await disclosure();
    expect(refundPolicies).toHaveLength(5);
    expect(refundPolicies[0]?.periodText).toContain("150일 이전");
    expect(refundPolicies[0]?.ruleText).toContain("15% 배상");
    expect(refundPolicies[4]?.ruleText).toContain("100%");
  });
});

describe("parseWeddingHallDisclosure 옐로라인가든 (변형 B·숫자 마커)", () => {
  /** 옐로라인가든: ①/② 대신 '1. 가격'/'2. 계약해지' 숫자 마커를 쓰는 변형 B. */
  const disclosure = async () => parseWeddingHallDisclosure(loadFixture("eloraine.xlsx"));

  it("숫자 마커로도 섹션을 찾아 업체명·홀을 읽는다", async () => {
    const d = await disclosure();
    expect(d.venueName).toBe("옐로라인가든 웨딩홀");
    expect(d.halls).toEqual(["엘로라홀"]);
  });

  it("시즌별 대관 가격을 읽는다", async () => {
    const { priceItems } = await disclosure();
    expect(
      findOne(priceItems, "엘로라홀", "대관료 (성수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 1월~8월)").priceMin,
    ).toBe(7900000);
    expect(
      findOne(priceItems, "엘로라홀", "대관료 (비수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 1월~8월)").priceMin,
    ).toBe(2000000);
    expect(
      findOne(priceItems, "엘로라홀", "대관료 (성수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 9월~12월)").priceMin,
    ).toBe(8500000);
    expect(
      findOne(priceItems, "엘로라홀", "대관료 (비수기)", "대관료 / 꽃장식 / 부페가 (기준: 2027년 9월~12월)").priceMin,
    ).toBe(3000000);
  });

  it("주요선택품목과 정책 6건을 읽는다", async () => {
    const { priceItems, refundPolicies } = await disclosure();
    expect(findOne(priceItems, "엘로라홀", "본식촬영", null).priceMin).toBe(1000000);
    expect(refundPolicies).toHaveLength(6);
    expect(refundPolicies[5]?.ruleText).toContain("100%");
  });
});

describe("parseWeddingHallDisclosure 비정상 입력", () => {
  it("엑셀이 아니면 예외를 던진다", async () => {
    await expect(parseWeddingHallDisclosure(Buffer.from("not an excel file"))).rejects.toThrow();
  });

  it("한글(HWP) 문서처럼 Excel이 아닌 OLE2 첨부면 안내 메시지와 함께 예외를 던진다", async () => {
    await expect(parseWeddingHallDisclosure(loadFixture("jey_art.xls"))).rejects.toThrow("한글(HWP)");
  });

  it("섹션 마커(①/②)가 없는 시트면 예외를 던진다", async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Sheet1").getCell("A1").value = "그냥 표";
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    await expect(parseWeddingHallDisclosure(buffer)).rejects.toThrow();
  });
});
