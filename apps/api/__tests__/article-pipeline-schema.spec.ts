import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

function enumBlock(enumName: string) {
  const match = schema.match(new RegExp(`enum ${enumName} \\{[\\s\\S]*?\\n\\}`));
  expect(match, `Expected enum ${enumName} to exist`).toBeTruthy();
  return match?.[0] ?? '';
}

describe('Article pipeline schema contract', () => {
  it('supports article approval lifecycle statuses used by Phase 4', () => {
    const block = enumBlock('ArticleDraftStatus');

    expect(block).toContain('NEEDS_REVIEW');
    expect(block).toContain('APPROVED');
    expect(block).toContain('REJECTED');
    expect(block).toContain('SCHEDULED');
    expect(block).toContain('PUBLISHED');
  });

  it('supports ready and active product eligibility states for article drafts', () => {
    const block = enumBlock('ProductStatus');

    expect(block).toContain('READY');
    expect(block).toContain('ACTIVE');
  });
});
