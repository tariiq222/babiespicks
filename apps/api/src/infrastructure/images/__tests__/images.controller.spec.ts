import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminApiKeyGuard } from '../../../features/admin/admin-api-key.guard';
import { ImageSlugPipe, ImagesController } from '../images.controller';

describe('ImagesController security controls', () => {
  it.each([
    ['processImage', ImagesController.prototype.processImage],
    ['processAllProducts', ImagesController.prototype.processAllProducts],
  ])('protects POST /images/%s with AdminApiKeyGuard', (_name, handler) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;

    expect(guards).toContain(AdminApiKeyGuard);
  });

  it('accepts only strict lowercase kebab-case slugs for image routes', () => {
    const pipe = new ImageSlugPipe('slug');

    expect(pipe.transform('baby-stroller-123')).toBe('baby-stroller-123');
    expect(() => pipe.transform('../secret')).toThrow(BadRequestException);
    expect(() => pipe.transform('Baby-Stroller')).toThrow(BadRequestException);
    expect(() => pipe.transform('baby_stroller')).toThrow(BadRequestException);
  });
});
