import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

/** Tiny persistent key/value store (JSON file in the user-data folder). */
export class JsonStore {
  private data: Record<string, unknown> = {};

  constructor(private file: string) {
    try {
      if (existsSync(file)) this.data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      this.data = {};
    }
  }

  get<T = unknown>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  set(key: string, value: unknown) {
    this.data[key] = value;
    this.flush();
  }

  delete(key: string) {
    delete this.data[key];
    this.flush();
  }

  private flush() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch {
      /* read-only file system – keep in memory */
    }
  }
}
