import { defineConfig } from 'drizzle-kit'

// Drizzle config for D1 (Cloudflare native SQLite).
// Schema files stay where they were — they're already vanilla drizzle-orm/sqlite-core.
//
// Migration flow:
//   1. Edit schema files under src/Backend/Schemas/
//   2. `npm run db:generate`              -> writes SQL to ./drizzle/
//   3. `npm run db:migrate:local`         -> applies to local D1 (miniflare)
//   4. `npm run db:migrate:remote`        -> applies to production D1
export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './src/Backend/Schemas/index.ts',
  out: './drizzle',
  verbose: true,
  strict: true
})
