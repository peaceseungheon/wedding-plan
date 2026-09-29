import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "./index";

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
  );
}

/** UPLOAD_DIR(기본 storage/uploads, 저장소 루트 기준 상대 경로) 아래에 파일을 기록한다. */
export function createLocalDiskStorage(
  baseDir: string = process.env.UPLOAD_DIR ?? "storage/uploads",
): Storage {
  const root = path.resolve(baseDir);

  function resolveKey(key: string): string {
    const target = path.resolve(root, key);
    // key에 경로 구분자가 섞여 루트 밖으로 새는 것을 어댑터 경계에서 차단한다.
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`storage key가 저장소 루트를 벗어납니다: ${key}`);
    }
    return target;
  }

  return {
    async put(key: string, bytes: Uint8Array): Promise<void> {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },

    async get(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
      try {
        // 복사 생성으로 Buffer와 ArrayBuffer를 공유하지 않는 독립 바이트를 돌려준다.
        return new Uint8Array(await readFile(resolveKey(key)));
      } catch (error) {
        if (isEnoent(error)) return null;
        throw error;
      }
    },

    async remove(key: string): Promise<void> {
      try {
        await unlink(resolveKey(key));
      } catch (error) {
        if (!isEnoent(error)) throw error;
      }
    },
  };
}
