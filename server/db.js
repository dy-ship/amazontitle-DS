import Database from 'better-sqlite3';
import fs from 'fs';

const db = new Database('data.db');

// Initialize tables
const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url)).toString();
db.exec(schema);

export function insertGeneration(row){
  const stmt = db.prepare(`INSERT INTO generations
    (created_at, ip, locale, model, name, node, color, size_volume, capacity, weight, material, brand, title, bullets_json)
    VALUES (@created_at, @ip, @locale, @model, @name, @node, @color, @size_volume, @capacity, @weight, @material, @brand, @title, @bullets_json)`);
  stmt.run(row);
}

export function listGenerations({limit=20, offset=0}={}){
  const stmt = db.prepare(`SELECT * FROM generations ORDER BY id DESC LIMIT ? OFFSET ?`);
  return stmt.all(limit, offset);
}
