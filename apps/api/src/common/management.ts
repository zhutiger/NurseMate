export function response<T>(data: T) {
  return { data, requestId: crypto.randomUUID() };
}
