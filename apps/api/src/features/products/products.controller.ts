import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { FindProductsDto } from './dto/find-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() dto: FindProductsDto) {
    return this.productsService.findAll(dto);
  }

  @Get('category/:categorySlug')
  findByCategory(
    @Param('categorySlug') categorySlug: string,
    @Query('locale') locale: string = 'ar',
  ) {
    return this.productsService.findByCategory(categorySlug, locale);
  }

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Query('locale') locale: string = 'ar',
  ) {
    const product = await this.productsService.findBySlug(slug, locale);
    if (!product) {
      throw new NotFoundException(`Product "${slug}" not found`);
    }
    return product;
  }
}
