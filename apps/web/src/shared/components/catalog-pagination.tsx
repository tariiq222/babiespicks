import {Link} from '../../i18n/navigation';

export function CatalogPagination({nextCursor,query,locale}:{nextCursor:string|null;query:Record<string,string>;locale:string}){
 if(!nextCursor)return null;
 return <nav aria-label={locale==='ar'?'صفحات المنتجات':'Product pages'} className="mt-8 flex justify-center"><Link href={{pathname:'/',query:{...query,cursor:nextCursor}}} className="inline-flex min-h-11 items-center rounded-lg bg-sage-deep px-5 text-sm text-cream">{locale==='ar'?'الصفحة التالية':'Next page'}<i aria-hidden="true" className="ti ti-arrow-left ms-2 ltr:rotate-180"/></Link></nav>;
}
