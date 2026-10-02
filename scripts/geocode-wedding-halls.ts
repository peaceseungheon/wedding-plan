// 예식장 주소 백필 geocoding CLI — 좌표(latitude/longitude)가 없는 예식장 행에 대해
// 카카오 로컬 주소 검색으로 위도·경도를 채운다. 사용: npm run geocode:wedding-halls
// 홀 단위 fail-soft(경고 후 스킵), 요청마다 스로틀. 재실행하면 좌표가 있는 행은 건너뛴다.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { searchAddress } from '../src/lib/adapters/kakao';

const REQUEST_DELAY_MS = 60;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL 환경변수가 없습니다 (.env 참조)');
  }
  if (process.env.KAKAO_API_KEY === undefined || process.env.KAKAO_API_KEY === '') {
    throw new Error('KAKAO_API_KEY 환경변수가 없습니다 (.env 참조)');
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
  try {
    const halls = await prisma.wedding_hall_disclosures.findMany({
      where: { latitude: null, address: { not: null } },
      select: { id: true, venueName: true, address: true },
      orderBy: [{ region: 'asc' }, { venueName: 'asc' }],
    });
    console.log(`좌표가 없는 예식장: ${halls.length}곳`);

    let geocoded = 0;
    let failed = 0;
    for (const hall of halls) {
      const address = hall.address;
      if (address === null) continue;
      const result = await searchAddress(address);
      if (result.ok) {
        await prisma.wedding_hall_disclosures.update({
          where: { id: hall.id },
          data: {
            latitude: result.coordinates.latitude,
            longitude: result.coordinates.longitude,
          },
        });
        geocoded += 1;
      } else {
        failed += 1;
        console.warn(`좌표 변환 실패(${hall.venueName}): ${address}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
    console.log(`완료: 성공 ${geocoded}, 실패 ${failed}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`오류: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
