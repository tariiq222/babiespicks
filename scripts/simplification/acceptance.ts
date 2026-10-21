import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { prisma } from '@babiespicks/db';
import { executeTool } from '@babiespicks/domain';
const dbUrl=process.env.TEST_DATABASE_URL;
const origin=process.env.TEST_WEB_URL??'http://localhost:3314';
if(!dbUrl||!new URL(dbUrl).pathname.endsWith('_test')||!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Only isolated _test database and local web server are permitted');
// Shared singleton is lazy; configure before its first query.
process.env.DATABASE_URL=dbUrl;
process.env.MEDIA_ROOT??=`${process.cwd()}/work/media`;
const suffix=Date.now().toString();
const actor={id:`acceptance-${suffix}`,canPublish:true};
let seq=0;
const run=(tool:string,args:Record<string,unknown>)=>executeTool(tool,{...args,...(tool.includes('_list_')||tool.includes('_get_')?{}:{idempotencyKey:`acceptance-${suffix}-${++seq}`})},actor);
const checks:Array<{path:string;status:number}>=[];
async function page(path:string,status=200){const r=await fetch(`${origin}${path}`,{redirect:'manual'});assert.equal(r.status,status,`${path}: expected ${status}, got ${r.status}`);checks.push({path,status:r.status});return r}
try{
 const category=await run('bp_upsert_category',{name:'منتجات تجريبية',slug:`acceptance-${suffix}`});
 const store=await run('bp_upsert_store',{name:'Amazon test',slug:`amazon-${suffix}`,url:'https://www.amazon.sa',affiliateNetwork:'Amazon Associates'});
 const ids:string[]=[];const slugs:string[]=[];
 for(let i=0;i<2;i++){
  const slug=`acceptance-product-${suffix}-${i}`;
  const p=await run('bp_create_product',{name:`عربة أطفال تجريبية ${i}`,slug,categoryId:category.id,translations:[{locale:'ar',name:`عربة أطفال تجريبية ${i}`,description:'وصف عربي للاختبار'},{locale:'en',name:`Acceptance baby stroller ${i}`,description:'Isolated test product'}]});
  await page(`/ar/products/${slug}`,404);
  await run('bp_set_status',{entityType:'product',id:p.id,status:'PUBLISHED',expectedVersion:p.version,confirm:true});
  await run('bp_record_price',{productId:p.id,storeId:store.id,amount:100+i*10,sourceUrl:'https://www.amazon.sa/dp/TEST',checkedAt:new Date().toISOString()});
  ids.push(p.id);slugs.push(slug);
  const response=await page(`/ar/products/${slug}`);assert.match(await response.text(),/عربة أطفال تجريبية/);
  await page(`/en/products/${slug}`);
 }
 for(const [type,segment] of [['OFFER','offers']] as const){
  const slug=`acceptance-${segment}-${suffix}`;
  const c=await run('bp_create_content',{type,slug,categoryId:category.id,productIds:ids,translations:[{locale:'ar',title:`محتوى تجريبي ${segment}`,content:'## عنوان موثق\n\nنص تجريبي مع **تنسيق**.'}]});
  await page(`/ar/${segment}/${slug}`,404);
  const published=await run('bp_set_status',{entityType:'content',id:c.id,status:'PUBLISHED',expectedVersion:c.version,confirm:true});
  const r=await page(`/ar/${segment}/${slug}`);const text=await r.text();assert.match(text,/<h2[^>]*>عنوان موثق<\/h2>/);
  assert.match(await (await page('/ar')).text(),new RegExp(slug));
  if(type==='OFFER'){await run('bp_set_status',{entityType:'content',id:c.id,status:'ARCHIVED',expectedVersion:published.version,confirm:true});await page(`/ar/offers/${slug}`,404)}
 }
 for(const path of ['/ar','/en','/ar/about','/ar/privacy','/ar/terms','/ar/disclosure','/ar/coupons','/api/ready','/sitemap.xml'])await page(path);
 for(const path of ['/ar/categories',`/ar/categories/${category.slug}`,'/ar/search?q=Acceptance','/ar/compare',`/ar/compare/${slugs[0]}/vs/${slugs[1]}`,'/ar/tools/finder','/ar/tools/calculator','/en/best','/ar/guides/retired','/ar/reviews/retired']){const response=await page(path,307);assert.ok(response.headers.get('location')?.startsWith('/ar')||response.headers.get('location')?.startsWith('/en'));}
 const clickBefore=await prisma.affiliateClick.count({where:{productId:ids[0]}});
 const redirect=await page(`/go/${ids[0]}/${store.id}`,302);assert.equal(new URL(redirect.headers.get('location')!).hostname,'www.amazon.sa');
 assert.equal(await prisma.affiliateClick.count({where:{productId:ids[0]}}),clickBefore+1);
 await page(`/go/best/${ids[0]}`,302);
 await page(`/go/${ids[0]}/missing-store`,404);
 const arabicStore=await run('bp_upsert_store',{name:'متجر تجريبي',slug:`متجر_${suffix}`,url:'https://www.noon.com'});
 await run('bp_upsert_coupon',{code:`TEST-${suffix}`,storeId:arabicStore.id,description:'قسيمة تجريبية',discountPercent:10});
 const couponResponse=await page(`/api/coupons?storeSlug=${encodeURIComponent(arabicStore.slug)}&status=ACTIVE`);assert.equal((await couponResponse.json()).length,1);
 const hidden=await prisma.product.findUniqueOrThrow({where:{id:ids[0]}});
 await run('bp_set_status',{entityType:'product',id:ids[0],status:'ARCHIVED',expectedVersion:hidden.version,confirm:true});
 await page(`/ar/products/${slugs[0]}`,404);await page(`/go/best/${ids[0]}`,404);
 const result={passed:true,checks,fixture:{productId:ids[1],productSlug:slugs[1],categorySlug:category.slug},testedAt:new Date().toISOString()};
 await writeFile('work/acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,fixture:result.fixture}));
}catch(error){console.error(error instanceof Error?error.message:'Acceptance failed');process.exitCode=1}
finally{await prisma.$disconnect()}
