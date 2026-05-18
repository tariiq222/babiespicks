import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() dto: SearchQueryDto) {
    const [results, facets] = await Promise.all([
      this.searchService.search(dto),
      this.searchService.getFacets(dto),
    ]);

    return {
      data: results.data,
      facets,
      total: results.total,
      nextCursor: results.nextCursor,
      query: dto.q,
    };
  }

  @Get('suggestions')
  async suggestions(@Query() dto: SearchQueryDto) {
    return this.searchService.getSuggestions(dto);
  }
}
