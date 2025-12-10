import sqlite3 from "sqlite3";
import { readFileSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config();

const DB_PATH = process.env.DB_PATH || "./database.sqlite";
const db = new sqlite3.Database(DB_PATH);

// Run migrations
const migrationPath = resolve("./migrations.sql");
const migrations = readFileSync(migrationPath, "utf8");

db.serialize(() => {
  db.exec(migrations, (err) => {
    if (err) console.error("Migration error:", err);
    else console.log("Database ready");
  });
});


export default db;
