import type {ShoppingContext} from '@babiespicks/domain/international';
import type {CatalogFilters} from './catalog-filters';
import {contextParams} from './offer-view';

/** Filter/context changes start a fresh page; only a next-page link supplies a cursor. */
export function catalogNavigationQuery(q:string,filters:CatalogFilters,context:ShoppingContext,next:Record<string,string>={}):Record<string,string>{
 return Object.fromEntries(Object.entries({q,category:filters.category,brand:filters.brand,price:filters.price,discount:filters.discount?'1':'',rated:filters.rated?'1':'',worth:filters.worth?'1':'',sort:filters.sort,...contextParams(context.shipTo,context.displayCurrency),maxAmount:context.budget?.amount??'',budgetCurrency:context.budget?.currency??'',...next}).filter(([key,value])=>value||key==='shipTo'||key==='currency'));
}
