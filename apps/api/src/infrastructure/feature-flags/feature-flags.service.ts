import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FeatureFlag, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'feature-flag:';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Check if a feature flag is enabled. Cached for 60s.
   */
  async isEnabled(key: string): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = this.cache.get<boolean>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
    });

    const enabled = flag?.enabled ?? false;
    this.cache.set(cacheKey, enabled, CACHE_TTL_SECONDS);
    return enabled;
  }

  /**
   * Get full flag details including metadata. Cached for 60s.
   */
  async getFlag(key: string): Promise<FeatureFlag | null> {
    const cacheKey = `${CACHE_PREFIX}full:${key}`;
    const cached = this.cache.get<FeatureFlag>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
    });

    if (flag) {
      this.cache.set(cacheKey, flag, CACHE_TTL_SECONDS);
    }

    return flag;
  }

  /**
   * List all feature flags (uncached — admin use).
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /**
   * Create or update a feature flag. Invalidates cache.
   */
  async setFlag(
    key: string,
    enabled: boolean,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<FeatureFlag> {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        enabled,
        description,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      create: {
        key,
        enabled,
        description,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    this.invalidateCache(key);
    this.logger.log(`Feature flag "${key}" set to ${enabled}`);
    return flag;
  }

  /**
   * Delete a feature flag. Invalidates cache.
   */
  async deleteFlag(key: string): Promise<void> {
    try {
      await this.prisma.featureFlag.delete({
        where: { key },
      });

      this.invalidateCache(key);
      this.logger.log(`Feature flag "${key}" deleted`);
    } catch (error) {
      // Prisma throws P2025 when record not found
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        throw new NotFoundException(`Feature flag "${key}" not found`);
      }
      throw error;
    }
  }

  private invalidateCache(key: string): void {
    this.cache.invalidate(`${CACHE_PREFIX}${key}`);
    this.cache.invalidate(`${CACHE_PREFIX}full:${key}`);
  }
}
