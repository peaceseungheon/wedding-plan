// Prisma 7: connection URL lives here, not in the datasource block.
// `import "dotenv/config"` makes the CLI load .env (Prisma 7 no longer does it automatically).
import path from "node:path";
import { defineConfig, env } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma", "schema.prisma"),
  datasource: {
    url: env("DATABASE_URL"),
  },
});
