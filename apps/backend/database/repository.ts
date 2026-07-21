import { db } from "./client";

export type Database = typeof db;

export abstract class BaseRepository {
  constructor(protected readonly database: Database = db) {}
}
