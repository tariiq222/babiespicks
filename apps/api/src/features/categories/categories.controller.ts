import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async findAll() {
    const cacheKey = 'categories:all';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.categoriesService.findAll();
    this.cache.set(cacheKey, result, 300);
    return result;
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    const cacheKey = `category:${slug}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const category = await this.categoriesService.findBySlug(slug);
    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found`);
    }

    this.cache.set(cacheKey, category, 120);
    return category;
  }
}
