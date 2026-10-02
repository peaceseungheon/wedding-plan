// 소비자원 예식장 가격공개 수집 CLI — 게시판 목록→상세→xlsx 다운로드→파싱→DB upsert.
// 사용: npx tsx scripts/scrape-wedding-halls.ts --region=0090000140[,0090000141,...] | --all
// 업체 단위 fail-soft(경고 후 스킵), 요청마다 스로틀.
// 참고: www.price.go.kr은 인증서 체인에서 중간 CA를 보내지 않아 Node fetch가
// UNABLE_TO_VERIFY_LEAF_SIGNATURE로 실패한다. macOS curl은 시스템 저장소로 검증되므로 HTTP는 curl로 수행한다.
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { parseWeddingHallDisclosure } from '../src/lib/domain/wedding-hall-disclosure';

const execFileAsync = promisify(execFile);

const BASE_URL = 'https://www.price.go.kr';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const REQUEST_DELAY_MS = 400;
const MAX_PAGES = 50;

const REGIONS = [
  { code: '0090000140', name: '서울(강남)' },
  { code: '0090000141', name: '서울(강남외)' },
  { code: '0090000142', name: '부산' },
  { code: '0090000143', name: '인천' },
  { code: '0090000144', name: '대구' },
  { code: '0090000145', name: '대전' },
  { code: '0090000146', name: '전남광주' },
  { code: '0090000147', name: '울산' },
  { code: '0090000148', name: '경기도' },
  { code: '0090000149', name: '충청.세종' },
  { code: '0090000150', name: '전라북도' },
  { code: '0090000151', name: '경상도' },
  { code: '0090000152', name: '강원도' },
  { code: '0090000153', name: '제주도' },
] as const;

const ANCHOR_RE = /fn_goReadView\('(\d+)'\);?">\s*([^<]+?)\s*<\/a>/g;
const FILE_RGTN_SEQ_RE = /name="fileRgtnSeq"[^>]*value="(\d+)"/;
const ADDRESS_RE = /주소\s+([\s\S]+?)(?=\s*연락처|\s*자료\s*공개일)/;
const PHONE_RE = /연락처\s+([\d-]+)/;
const DISCLOSED_AT_RE = /자료\s*공개일\s+(\d{4}-\d{2}-\d{2})/;

interface VenueLink {
  readonly boardSeq: number;
  readonly venueName: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function curl(args: readonly string[]): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      ['-sS', '--fail-with-body', '--max-time', '60', ...args],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`curl 실패 (${args.join(' ')}): ${detail}`);
  } finally {
    await sleep(REQUEST_DELAY_MS);
  }
}

async function postForm(path: string, fields: Record<string, string>): Promise<string> {
  const body = new URLSearchParams(fields).toString();
  const output = await curl([
    '-X', 'POST',
    `${BASE_URL}${path}`,
    '-H', `User-Agent: ${USER_AGENT}`,
    '-H', 'Content-Type: application/x-www-form-urlencoded',
    '--data-binary', body,
  ]);
  return output.toString('utf8');
}

async function getBinary(path: string): Promise<Buffer> {
  return curl([`${BASE_URL}${path}`, '-H', `User-Agent: ${USER_AGENT}`]);
}

async function getText(path: string): Promise<string> {
  const output = await getBinary(path);
  return output.toString('utf8');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchVenueLinks(boardTypeCode: string): Promise<VenueLink[]> {
  const links: VenueLink[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const html = await postForm('/tprice/portal/board/boardInfoMgr.do', {
      boardTypeCode,
      searchType: '',
      boardSeq: '',
      actionType: '',
      pageNo: String(page),
      orderColumn: 'INPUT_DTTM',
      order: 'DESC',
    });
    const matches = [...html.matchAll(ANCHOR_RE)];
    if (matches.length === 0) break;
    for (const match of matches) {
      links.push({ boardSeq: Number(match[1]), venueName: decodeEntities(match[2] ?? '') });
    }
  }
  return links;
}

async function fetchFileRgtnSeq(boardTypeCode: string, boardSeq: number): Promise<number | null> {
  const html = await postForm('/tprice/portal/board/boardInfoDetail.do', {
    boardTypeCode,
    boardSeq: String(boardSeq),
    actionType: 'read',
  });
  const match = html.match(FILE_RGTN_SEQ_RE);
  if (match === null) return null;
  const seq = Number(match[1]);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

async function fetchVenueMeta(
  boardTypeCode: string,
  boardSeq: number,
): Promise<{ address: string | null; phone: string | null; disclosedAt: Date | null }> {
  const html = await getText(
    `/tprice/portal/board/BoardReadView.do?boardTypeCode=${boardTypeCode}&boardSeq=${boardSeq}`,
  );
  const text = stripTags(html);
  const address = text.match(ADDRESS_RE)?.[1]?.trim() ?? null;
  const phone = text.match(PHONE_RE)?.[1] ?? null;
  const disclosedAtText = text.match(DISCLOSED_AT_RE)?.[1] ?? null;
  return {
    address,
    phone,
    disclosedAt: disclosedAtText === null ? null : new Date(`${disclosedAtText}T00:00:00+09:00`),
  };
}

async function fetchFileName(fileRgtnSeq: number): Promise<string | null> {
  const body = await postForm('/tprice/common/file/getFileInfo.do', {
    fileRgtnSeq: String(fileRgtnSeq),
  });
  const parsed: unknown = JSON.parse(body.trim());
  if (typeof parsed !== 'object' || parsed === null) return null;
  const fileName = (parsed as { orgn_file_name?: unknown }).orgn_file_name;
  return typeof fileName === 'string' && fileName !== '' ? fileName : null;
}

async function upsertDisclosure(
  prisma: PrismaClient,
  input: {
    boardSeq: number;
    region: string;
    venueName: string;
    address: string | null;
    phone: string | null;
    fileRgtnSeq: number | null;
    fileName: string | null;
    disclosedAt: Date | null;
    xlsx: Buffer;
  },
): Promise<{ priceItemCount: number; refundPolicyCount: number }> {
  const disclosure = await parseWeddingHallDisclosure(input.xlsx);
  const existing = await prisma.wedding_hall_disclosures.findUnique({
    where: { boardSeq: input.boardSeq },
    select: { id: true },
  });
  if (existing !== null) {
    await prisma.wedding_hall_disclosures.update({
      where: { boardSeq: input.boardSeq },
      data: {
        region: input.region,
        venueName: input.venueName,
        address: input.address,
        phone: input.phone,
        fileRgtnSeq: input.fileRgtnSeq,
        fileName: input.fileName,
        disclosedAt: input.disclosedAt,
        scrapedAt: new Date(),
      },
    });
    await prisma.wedding_hall_price_items.deleteMany({ where: { disclosureId: existing.id } });
    await prisma.wedding_hall_refund_policies.deleteMany({ where: { disclosureId: existing.id } });
    await prisma.wedding_hall_price_items.createMany({
      data: disclosure.priceItems.map((item) => ({ ...item, disclosureId: existing.id })),
    });
    await prisma.wedding_hall_refund_policies.createMany({
      data: disclosure.refundPolicies.map((policy) => ({ ...policy, disclosureId: existing.id })),
    });
    return { priceItemCount: disclosure.priceItems.length, refundPolicyCount: disclosure.refundPolicies.length };
  }
  await prisma.wedding_hall_disclosures.create({
    data: {
      boardSeq: input.boardSeq,
      region: input.region,
      venueName: input.venueName,
      address: input.address,
      phone: input.phone,
      fileRgtnSeq: input.fileRgtnSeq,
      fileName: input.fileName,
      disclosedAt: input.disclosedAt,
      priceItems: { create: disclosure.priceItems },
      refundPolicies: { create: disclosure.refundPolicies },
    },
  });
  return { priceItemCount: disclosure.priceItems.length, refundPolicyCount: disclosure.refundPolicies.length };
}

async function scrapeRegion(prisma: PrismaClient, regionCode: string, regionName: string): Promise<void> {
  const links = await fetchVenueLinks(regionCode);
  console.log(`[${regionName}] 게시물 ${links.length}건 발견`);
  let saved = 0;
  let skipped = 0;
  for (const link of links) {
    try {
      const fileRgtnSeq = await fetchFileRgtnSeq(regionCode, link.boardSeq);
      if (fileRgtnSeq === null) {
        console.warn(`[경고] ${link.venueName}(boardSeq=${link.boardSeq}) 첨부파일 없음 — 스킵`);
        skipped += 1;
        continue;
      }
      const [meta, fileName] = await Promise.all([
        fetchVenueMeta(regionCode, link.boardSeq),
        fetchFileName(fileRgtnSeq),
      ]);
      const xlsx = await getBinary(`/tprice/common/file/file_down.do?fileRgtnSeq=${fileRgtnSeq}`);
      const counts = await upsertDisclosure(prisma, {
        boardSeq: link.boardSeq,
        region: regionName,
        venueName: link.venueName === '' ? (fileName ?? '').replace(/\.xlsx$/i, '') : link.venueName,
        address: meta.address,
        phone: meta.phone,
        disclosedAt: meta.disclosedAt,
        fileRgtnSeq,
        fileName,
        xlsx,
      });
      saved += 1;
      console.log(`  저장: ${link.venueName} (가격 ${counts.priceItemCount}건, 정책 ${counts.refundPolicyCount}건)`);
    } catch (error) {
      skipped += 1;
      console.warn(
        `[경고] ${link.venueName}(boardSeq=${link.boardSeq}) 스킵: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(`[${regionName}] 완료: 저장 ${saved}건, 스킵 ${skipped}건`);
}

function parseRegionArgs(argv: readonly string[]): string[] {
  const all = argv.includes('--all');
  const regionArg = argv.find((arg) => arg.startsWith('--region='));
  if (all && regionArg !== undefined) {
    throw new Error('--all과 --region은 함께 쓸 수 없습니다');
  }
  if (all) return REGIONS.map((region) => region.code);
  if (regionArg === undefined) {
    throw new Error('사용법: npx tsx scripts/scrape-wedding-halls.ts --region=<코드[,코드...]> | --all');
  }
  const codes = regionArg
    .slice('--region='.length)
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '');
  const invalid = codes.filter((code) => !REGIONS.some((region) => region.code === code));
  if (invalid.length > 0) {
    throw new Error(`알 수 없는 지역 코드: ${invalid.join(', ')} (가능: ${REGIONS.map((r) => r.code).join(', ')})`);
  }
  if (codes.length === 0) {
    throw new Error('지역 코드가 비어 있습니다');
  }
  return codes;
}

async function main(): Promise<void> {
  const codes = parseRegionArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL 환경변수가 없습니다 (.env 참조)');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
  try {
    for (const code of codes) {
      const region = REGIONS.find((entry) => entry.code === code)!;
      await scrapeRegion(prisma, region.code, region.name);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`오류: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
