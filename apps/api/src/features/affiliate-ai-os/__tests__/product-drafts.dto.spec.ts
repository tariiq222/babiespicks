import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_DRAFT_IDEMPOTENCY_KEY_MAX_LENGTH,
  PRODUCT_DRAFT_NOTES_MAX_LENGTH,
  PRODUCT_DRAFT_REASON_MAX_LENGTH,
  PRODUCT_DRAFT_REVIEWER_ID_MAX_LENGTH,
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
