// server/src/db/migrate.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  console.log("db:migrate running schema.sql...");
  await pool.query(sql);
  console.log("db:migrate done ✅");
}

main()
  .catch((e) => {
    console.error("db:migrate failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
