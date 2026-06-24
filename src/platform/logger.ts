export function log(tag: string, ...args: unknown[]): void {
  console.log(`[${tag}]`, ...args);
}

export function logError(tag: string, ...args: unknown[]): void {
  console.error(`[${tag}]`, ...args);
}
