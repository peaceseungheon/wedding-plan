import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client";

/**
 * Prisma 7은 driver adapter 필수다(learnings.md). PrismaMariaDb에는 URL을
 * 위치 인자로 넘긴다. {connectionString} 객체를 넘기면 자격증명이 빈 채로
 * 풀에 들어가 P2039 pool timeout으로 변장해 터진다.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new Error("DATABASE_URL 환경변수가 설정되어 있지 않습니다. .env를 확인하세요.");
  }
  return new PrismaClient({ adapter: new PrismaMariaDb(url) });
}

declare global {
  // Next dev의 핫리로드가 모듈을 재평가해도 커넥션 풀이 중복 생성되지 않게
  // 전역에 인스턴스를 하나만 둔다 (Next.js 공식 싱글턴 패턴).
  var __weddingPlanPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = globalThis.__weddingPlanPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__weddingPlanPrisma = prisma;
}
