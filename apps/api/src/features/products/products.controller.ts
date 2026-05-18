import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { FindProductsDto } from './dto/find-products.dto';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async findAll(@Query() dto: FindProductsDto) {
    const cacheKey = `products:${dto.locale || 'ar'}:${dto.cursor || 'initial'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.productsService.findAll(dto);
    this.cache.set(cacheKey, result, 60);
    return result;
  }

  @Get('category/:categorySlug')
  async findByCategory(
    @Param('categorySlug') categorySlug: string,
    @Query('locale') locale: string = 'ar',
  ) {
    const cacheKey = `products:category:${categorySlug}:${locale}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.productsService.findByCategory(categorySlug, locale);
    this.cache.set(cacheKey, result, 60);
    return result;
  }

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Query('locale') locale: string = 'ar',
  ) {
    const cacheKey = `product:${slug}:${locale}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productsService.findBySlug(slug, locale);
    if (!product) {
      throw new NotFoundException(`Product "${slug}" not found`);
    }

    this.cache.set(cacheKey, product, 120);
    return product;
  }
}
