import { createLocalDiskStorage } from "./local-disk";

/**
 * 문서 저장소 어댑터 계약. key는 서버가 생성한 안전한 파일명
 * (uuid 접두어 + 경로 구분자 제거된 원본 이름)이며 put/get/remove가 key 기준으로 동작한다.
 * S3 등 원격 백엔드는 docs/ROADMAP-non-mvp.md의 확장점이고 MVP는 local-disk만 제공한다.
 */
export type Storage = {
  readonly put: (key: string, bytes: Uint8Array) => Promise<void>;
  /** 파일이 없으면 null을 돌려준다(존재하지 않음은 정상 결과다). */
  readonly get: (key: string) => Promise<Uint8Array<ArrayBuffer> | null>;
  /** 대상이 없어도 실패로 보지 않는다(삭제는 멱등). */
  readonly remove: (key: string) => Promise<void>;
};

/** MVP 저장소 구현체. UPLOAD_DIR(기본 storage/uploads) 아래 로컬 디스크에 기록한다. */
export const storage: Storage = createLocalDiskStorage();
