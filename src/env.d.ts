// Ambient declarations for built-in Node modules used by SEO/build helpers.
// The project intentionally does not depend on @types/node; we declare only the
// narrow surface area we touch (hashing, fs read, path resolve) so type-checking
// stays self-contained.

declare module 'node:crypto' {
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: 'hex' | 'base64'): string;
  }
  export function createHash(algorithm: string): Hash;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}