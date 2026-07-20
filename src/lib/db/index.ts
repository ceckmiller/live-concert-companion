import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";
import { getServerEnv } from "../runtime-env";
import * as schema from "./schema";

function createDb() {
  const url = getServerEnv("TURSO_DATABASE_URL") ?? "file:./local.db";
  const authToken = getServerEnv("TURSO_AUTH_TOKEN");

  const client = createClient(
    url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" },
  );

  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
