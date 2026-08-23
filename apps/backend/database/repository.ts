import { db } from "./client";

export type Database = typeof db;

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export abstract class BaseRepository {
  constructor(protected readonly database: Database | Transaction = db) {}
}
