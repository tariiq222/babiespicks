import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH,
  PRODUCT_DRAFT_LIST_OFFSET_MAX,
  PRODUCT_DRAFT_NOTES_MAX_LENGTH,
  PRODUCT_DRAFT_REASON_MAX_LENGTH,
  PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH,
  ListProductDraftsQueryDto,
  ProductDraftTransitionBodyDto,
} from '../dto/product-drafts.dto';

describe('ProductDraftTransitionBodyDto', () => {
  it('bounds reviewer metadata fields to prevent oversized transition payloads', async () => {
    const dto = Object.assign(new ProductDraftTransitionBodyDto(), {
      reviewerId: 'r'.repeat(PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH + 1),
      idempotencyKey: 'i'.repeat(PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH + 1),
      reason: 'x'.repeat(PRODUCT_DRAFT_REASON_MAX_LENGTH + 1),
      notes: 'n'.repeat(PRODUCT_DRAFT_NOTES_MAX_LENGTH + 1),
    });

    const errorProperties = (await validate(dto)).map((error) => error.property);

    expect(errorProperties).toEqual(
      expect.arrayContaining(['reviewerId', 'idempotencyKey', 'reason', 'notes']),
    );
  });
});

describe('ListProductDraftsQueryDto', () => {
  it('accepts valid offset pagination bounds', async () => {
    const dto = Object.assign(new ListProductDraftsQueryDto(), {
      limit: 25,
      offset: PRODUCT_DRAFT_LIST_OFFSET_MAX,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects negative or oversized offsets', async () => {
    const negative = Object.assign(new ListProductDraftsQueryDto(), { offset: -1 });
    const oversized = Object.assign(new ListProductDraftsQueryDto(), {
      offset: PRODUCT_DRAFT_LIST_OFFSET_MAX + 1,
    });

    expect((await validate(negative)).map((error) => error.property)).toContain('offset');
    expect((await validate(oversized)).map((error) => error.property)).toContain('offset');
  });
});
