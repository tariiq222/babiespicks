export function parseJsonResponse<T = unknown>(content: string): T {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON found in AI response');
    return JSON.parse(match[0]) as T;
  }
}
