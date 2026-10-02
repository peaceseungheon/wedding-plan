import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

/** 개인용 영역 유니코드 아이콘(BMP + 보충 영역 A) — 업체명 등에 섞여 들어온다. */
const PUA_RE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}]/gu;
/** 닫힌 범위 가격: "85,000~130,000원", "99,000원~132,000원", "58천원 ~ 78천원" */
const RANGE_RE = /(\d[\d,]*)\s*(만원|천원|원)?\s*~\s*(\d[\d,]*)\s*(만원|천원|원)?/g;
/** 열린 범위 가격: "7,000,000원~" — 단위를 요구해 "300명~1000명" 같은 인원 표기와 겹치지 않게 한다. */
const OPEN_RANGE_RE = /(\d[\d,]*)\s*(만원|천원|원)\s*~/g;
/** 단일 가격: "4,200,000원", "200만원", "8천원" */
const SINGLE_RE = /(\d[\d,]*)\s*(만원|천원|원)/g;

export interface WeddingHallPriceItem {
  hallName: string;
  itemGroup: string | null;
  itemName: string;
  rawValue: string | null;
  priceMin: number | null;
  priceMax: number | null;
  sortOrder: number;
}

export interface WeddingHallRefundPolicy {
  periodText: string;
  ruleText: string;
  sortOrder: number;
}

export interface WeddingHallDisclosure {
  venueName: string;
  halls: string[];
  priceItems: WeddingHallPriceItem[];
  refundPolicies: WeddingHallRefundPolicy[];
}

/** 셀 하나에서 뽑은 가격 세그먼트. name은 가격 앞에 붙은 텍스트다. */
interface PriceSegment {
  name: string;
  min: number | null;
  max: number | null;
  raw: string;
}

/** exceljs 셀값을 문자열로 정규화한다(리치 텍스트 결합, 수식은 결과값 사용). */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("formula" in value || "sharedFormula" in value) {
      const result = "result" in value ? value.result : undefined;
      return result === null || result === undefined ? "" : String(result);
    }
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

/** 개인용 유니코드 아이콘을 지우고 공백을 정리한다. */
function cleanText(text: string): string {
  return text.replace(PUA_RE, "").replace(/\u00a0/g, " ").trim();
}

/** 세그먼트·정책 라인의 가장자리에 붙은 구분자를 뗀다. */
function stripEdges(text: string): string {
  return cleanText(text).replace(/^[\s~\-:*,·]+/, "").replace(/[\s~\-:*,·]+$/, "");
}

function parseNumber(text: string): number {
  return Number(text.replace(/,/g, ""));
}

/** 가격 숫자에 단위 승수(만원=10000, 천원=1000)를 곱한다. 단위가 없으면 이미 원 단위다. */
function unitValue(text: string, unit: string | undefined): number {
  const base = parseNumber(text);
  if (unit === "만원") return base * 10000;
  if (unit === "천원") return base * 1000;
  return base;
}

/** 한 줄에서 가격 세그먼트 전체를 뽑는다. 이름은 직전 세그먼트 끝부터 현재 시작 사이 텍스트. */
function extractSegments(line: string): PriceSegment[] {
  interface RawMatch {
    start: number;
    end: number;
    min: number | null;
    max: number | null;
    text: string;
  }
  const matches: RawMatch[] = [];
  const overlaps = (index: number) =>
    matches.some((m) => index >= m.start && index < m.end);

  for (const match of line.matchAll(RANGE_RE)) {
    matches.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      min: unitValue(match[1]!, match[2]),
      max: unitValue(match[3]!, match[4]),
      text: match[0],
    });
  }
  for (const match of line.matchAll(OPEN_RANGE_RE)) {
    const start = match.index ?? 0;
    if (overlaps(start)) continue;
    matches.push({
      start,
      end: start + match[0].length,
      min: unitValue(match[1]!, match[2]),
      max: null,
      text: match[0],
    });
  }
  for (const match of line.matchAll(SINGLE_RE)) {
    const start = match.index ?? 0;
    if (overlaps(start)) continue;
    matches.push({
      start,
      end: start + match[0].length,
      min: unitValue(match[1]!, match[2]),
      max: unitValue(match[1]!, match[2]),
      text: match[0],
    });
  }
  matches.sort((a, b) => a.start - b.start);

  const segments: PriceSegment[] = [];
  let previousEnd = 0;
  for (const match of matches) {
    segments.push({
      name: stripEdges(line.slice(previousEnd, match.start)),
      min: match.min,
      max: match.max,
      raw: match.text,
    });
    previousEnd = match.end;
  }
  return segments;
}

/** 값이 사실상 비어 있거나('‑', '—') 의미 없는 셀인지 확인한다. */
function isBlankValue(value: string): boolean {
  return value === "" || value === "-" || value === "—" || value === "·";
}

interface HallBlock {
  hall: string;
  rows: number[];
}

/** 소비자원 예식장 가격공개 xlsx를 구조화한다. 레이아웃이 달라지면 예외를 던진다. */
export async function parseWeddingHallDisclosure(
  buffer: Buffer,
): Promise<WeddingHallDisclosure> {
  // D0 CF 11 E0: OLE2 컨테이너 시그니처 — 구형 .xls(Excel 97-2003)와 한글(HWP) 문서가 공유한다.
  // exceljs는 이 형식을 읽지 못하므로 SheetJS로 읽는다. HWP는 Workbook 스트림이 없어 로드에 실패한다.
  let rowCount = 0;
  let colCount = 0;
  const grid: string[][] = [];
  const isOle2 =
    buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  if (isOle2) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      throw new Error("한글(HWP) 문서 등 Excel 통합문서가 아닌 OLE2 첨부는 지원하지 않습니다.");
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName === undefined ? undefined : workbook.Sheets[sheetName];
    if (sheet === undefined) throw new Error("워크시트가 비어 있어 예식장 공개 자료를 해석할 수 없습니다.");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: true,
    });
    rowCount = rows.length;
    for (const row of rows) colCount = Math.max(colCount, row?.length ?? 0);
    for (let row = 1; row <= rowCount; row += 1) grid[row] = [""];
    for (let row = 0; row < rows.length; row += 1) {
      const cells = rows[row] ?? [];
      for (let col = 0; col < cells.length; col += 1) {
        const value = cells[col];
        grid[row + 1][col + 1] = cleanText(value === null || value === undefined ? "" : String(value));
      }
    }
    // SheetJS는 병합 범위에 좌상단 값을 전파하지 않는다 — exceljs 그리드와 같은 모양으로 만들려고 직접 채운다.
    for (const merge of sheet["!merges"] ?? []) {
      const origin = grid[merge.s.r + 1]?.[merge.s.c + 1] ?? "";
      if (origin === "") continue;
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        for (let col = merge.s.c; col <= merge.e.c; col += 1) {
          if (grid[row + 1] === undefined) continue;
          grid[row + 1][col + 1] = origin;
        }
      }
    }
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("워크시트가 비어 있어 예식장 공개 자료를 해석할 수 없습니다.");
    rowCount = worksheet.rowCount;
    colCount = worksheet.columnCount;
    for (let row = 1; row <= rowCount; row += 1) {
      grid[row] = [""];
      const worksheetRow = worksheet.getRow(row);
      for (let col = 1; col <= colCount; col += 1) {
        grid[row][col] = cleanText(cellToString(worksheetRow.getCell(col).value));
      }
    }
  }

  const findMarkerRow = (marker: string): number => {
    for (let row = 1; row <= rowCount; row += 1) {
      if (grid[row]?.some((cell) => cell.includes(marker))) return row;
    }
    throw new Error(`섹션 마커(${marker})를 찾을 수 없어 예식장 공개 자료를 해석할 수 없습니다.`);
  };
  const priceSectionRow = findMarkerRow("①");
  const policySectionRow = findMarkerRow("②");

  // 헤더 행: ① 다음부터 이어지는, '예식홀명' 셀을 포함한 행들. 첫 행=상단, 마지막 행=리프.
  // 표준 레이아웃은 1열에 '예식홀명'이 오지만, '통합' 레이아웃은 앞에 예식장 열이 하나 더 있어
  // '예식홀명'이 위치한 열(hallCol)을 동적으로 찾아 이후 로직의 기준으로 쓴다.
  const findHallColumn = (row: number): number | null => {
    const cells = grid[row] ?? [];
    for (let col = 1; col <= colCount; col += 1) {
      if (cells[col] === "예식홀명") return col;
    }
    return null;
  };
  const headerRows: number[] = [];
  for (let row = priceSectionRow + 1; row < policySectionRow; row += 1) {
    if (findHallColumn(row) === null) break;
    headerRows.push(row);
  }
  if (headerRows.length === 0) {
    throw new Error("헤더 행(예식홀명)을 찾을 수 없어 예식장 공개 자료를 해석할 수 없습니다.");
  }
  const hallCol = findHallColumn(headerRows[headerRows.length - 1]!)!;
  const topHeader = grid[headerRows[0]!]!;
  const leafHeader = grid[headerRows[headerRows.length - 1]!]!;

  // 홀 블록: 데이터 영역에서 hallCol 값이 바뀌는 지점마다 새 블록.
  const blocks: HallBlock[] = [];
  for (let row = headerRows[headerRows.length - 1]! + 1; row < policySectionRow; row += 1) {
    const cells = grid[row] ?? [];
    if (cells.every((cell) => cell === "")) continue;
    const hallName = cells[hallCol] ?? "";
    if (hallName !== "") {
      const current = blocks[blocks.length - 1];
      if (!current || current.hall !== hallName) blocks.push({ hall: hallName, rows: [row] });
      else current.rows.push(row);
    } else {
      blocks[blocks.length - 1]?.rows.push(row);
    }
  }

  // 페어 컬럼(라벨 열 + 가격 열) 검출. 규칙(a) 헤더: 상단·리프가 같은 병합 헤더.
  const pairRightCol = new Set<number>();
  const pairLeftCols: number[] = [];
  for (let col = hallCol + 1; col < colCount; col += 1) {
    const top = topHeader[col] ?? "";
    if (top === "") continue;
    if (top === (topHeader[col + 1] ?? "") && top === (leafHeader[col] ?? "") && top === (leafHeader[col + 1] ?? "")) {
      pairLeftCols.push(col);
      pairRightCol.add(col + 1);
    }
  }
  // 규칙(b) 데이터 폴백: 블록에서 라벨이 2종 이상 변하고 오른쪽 열에 가격이 있으면 페어로 본다.
  for (let col = hallCol + 1; col < colCount; col += 1) {
    if (pairLeftCols.includes(col) || pairRightCol.has(col) || pairRightCol.has(col - 1)) continue;
    const isPair = blocks.some((block) => {
      const labels = new Set(
        block.rows.map((row) => grid[row]?.[col] ?? "").filter((label) => label !== ""),
      );
      return (
        labels.size >= 2 &&
        [...labels].every((label) => !label.includes("원")) &&
        block.rows.some((row) => (grid[row]?.[col + 1] ?? "").includes("원"))
      );
    });
    if (isPair) {
      pairLeftCols.push(col);
      pairRightCol.add(col + 1);
    }
  }

  const priceItems: WeddingHallPriceItem[] = [];
  let sortOrder = 0;
  const pushItem = (item: Omit<WeddingHallPriceItem, "sortOrder">) => {
    priceItems.push({ ...item, sortOrder });
    sortOrder += 1;
  };

  for (let col = hallCol + 1; col <= colCount; col += 1) {
    if (pairRightCol.has(col)) continue;

    if (pairLeftCols.includes(col)) {
      const group = topHeader[col] ?? leafHeader[col] ?? "";
      for (const block of blocks) {
        for (const row of block.rows) {
          const label = grid[row]?.[col] ?? "";
          const value = grid[row]?.[col + 1] ?? "";
          if (label === "" || isBlankValue(value)) continue;
          const segments = extractSegments(value.replace(/\n/g, " "));
          for (const segment of segments) {
            pushItem({
              hallName: block.hall,
              itemGroup: group,
              itemName: label,
              rawValue: value,
              priceMin: segment.min,
              priceMax: segment.max,
            });
          }
        }
      }
      continue;
    }

    // 직접 컬럼: 블록에서 첫 의미 있는 값을 헤더명 항목으로 정리한다.
    const headerName = leafHeader[col] || topHeader[col] || "";
    if (headerName === "") continue;
    for (const block of blocks) {
      const value = block.rows
        .map((row) => grid[row]?.[col] ?? "")
        .find((cell) => !isBlankValue(cell));
      if (value === undefined) continue;

      const lines = value
        .split(/\r?\n/)
        .map((line) => stripEdges(line))
        .filter((line) => line !== "");
      const segmentsPerLine = lines.map((line) => ({ line, segments: extractSegments(line) }));
      const totalSegments = segmentsPerLine.reduce((sum, entry) => sum + entry.segments.length, 0);

      for (const { line, segments } of segmentsPerLine) {
        if (segments.length === 0) {
          pushItem({
            hallName: block.hall,
            itemGroup: headerName,
            itemName: line,
            rawValue: line,
            priceMin: null,
            priceMax: null,
          });
          continue;
        }
        for (const segment of segments) {
          const singleUnnamed = totalSegments === 1 && segment.name === "";
          pushItem({
            hallName: block.hall,
            itemGroup: singleUnnamed ? null : headerName,
            itemName: singleUnnamed ? headerName : segment.name || headerName,
            rawValue: line,
            priceMin: segment.min,
            priceMax: segment.max,
          });
        }
      }
    }
  }

  // 위약금 정책: ② 아래 행들. 병합 전파로 같은 내용이 반복되면 첫 행만 본다.
  const refundPolicies: WeddingHallRefundPolicy[] = [];
  const seenRowSignatures = new Set<string>();
  for (let row = policySectionRow + 1; row <= rowCount; row += 1) {
    const values: string[] = [];
    for (let col = 1; col <= colCount; col += 1) {
      const cell = grid[row]?.[col] ?? "";
      if (cell !== "" && !values.includes(cell)) values.push(cell);
    }
    if (values.length === 0) continue;
    const signature = values.join("\u0000");
    if (seenRowSignatures.has(signature)) continue;
    seenRowSignatures.add(signature);

    // 각주('*')·주석('※')로 시작하는 행은 정책이 아니다.
    if (values[0]!.startsWith("※") || values[0]!.startsWith("*")) continue;

    if (values.length >= 2) {
      refundPolicies.push({
        periodText: values[0]!,
        ruleText: values.slice(1).join(" "),
        sortOrder: refundPolicies.length,
      });
      continue;
    }
    for (const rawLine of values[0]!.split(/\r?\n/)) {
      const cleaned = cleanText(rawLine);
      if (cleaned === "" || cleaned.startsWith("※") || cleaned.startsWith("*")) continue;
      const line = cleaned.replace(/^[\s\-–*·]+/, "").trim();
      if (line === "") continue;
      const colonIndex = line.indexOf(":");
      const periodText = colonIndex >= 0 ? line.slice(0, colonIndex).trim() : line;
      const ruleText = colonIndex >= 0 ? line.slice(colonIndex + 1).trim() : "";
      refundPolicies.push({ periodText, ruleText, sortOrder: refundPolicies.length });
    }
  }

  // 업체명: 첫 행에서 마커가 아닌 첫 비어있지 않은 셀(표준=1열, 통합=2열). 아이콘·기호 접두어를 뗀다.
  let venueName = "";
  for (let row = 1; row <= Math.min(3, rowCount) && venueName === ""; row += 1) {
    for (let col = 1; col <= colCount; col += 1) {
      const cell = grid[row]?.[col] ?? "";
      if (cell === "" || cell.startsWith("①") || cell.startsWith("②")) continue;
      venueName = cell.replace(/^[\s*□■▶]+/, "").trim();
      break;
    }
  }

  return {
    venueName,
    halls: blocks.map((block) => block.hall),
    priceItems,
    refundPolicies,
  };
}
