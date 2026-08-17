import dotenv from "dotenv";
import path from "path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.ts";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../../.env"),
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const db = new PrismaClient({
  adapter: new PrismaLibSql({
    url: databaseUrl,
    authToken: process.env.TURSO_AUTH_TOKEN ?? undefined,
  }),
});
