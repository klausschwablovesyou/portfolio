import { join } from '@std/path';

/** Recursively yields files under `dir` whose name ends with `ext`. */
export async function* walk(dir: string, ext: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) yield* walk(path, ext);
    else if (entry.isFile && entry.name.endsWith(ext)) yield path;
  }
}
