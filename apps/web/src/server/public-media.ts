export function publicMediaType(name: string): string | null {
  if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(name)) return null;
  return { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[name.split('.').at(-1)!] ?? null;
}
