import type { PrismaClient } from '@babiespicks/db';
export async function captureInventory(db:PrismaClient,visibilityMode:'legacy'|'canonical'='canonical'){
 const [products,pages,offers,clicks,prices,subscribers]=await Promise.all([
  db.product.findMany({select:{id:true,slug:true,isActive:true,publishStatus:true}}),
  db.contentPage.findMany({select:{id:true,slug:true,isPublished:true,publishStatus:true}}),
  db.publicOffer.findMany({select:{id:true,slug:true,status:true}}),
  db.affiliateClick.count(),db.productPrice.count(),db.newsletterSubscriber.count(),
 ]);
 return {visibilityMode,capturedAt:new Date().toISOString(),products,pages,offers,clicks,prices,subscribers};
}
export async function verifyMigration(db:PrismaClient,before:Awaited<ReturnType<typeof captureInventory>>){
 const after=await captureInventory(db);const failures:string[]=[];
 for(const old of before.products){const row=after.products.find(p=>p.id===old.id);if(!row||row.slug!==old.slug)failures.push(`Product identity lost: ${old.id}`);else if((before.visibilityMode==='legacy'?old.isActive:old.publishStatus==='PUBLISHED')!==(row.publishStatus==='PUBLISHED'))failures.push(`Product public visibility changed: ${old.id}`)}
 for(const old of before.pages){const row=after.pages.find(p=>p.id===old.id);if(!row||row.slug!==old.slug)failures.push(`Content identity lost: ${old.id}`);else if((before.visibilityMode==='legacy'?old.isPublished:old.publishStatus==='PUBLISHED')!==(row.publishStatus==='PUBLISHED'))failures.push(`Content public visibility changed: ${old.id}`)}
 if(after.clicks<before.clicks)failures.push('Click count decreased');if(after.prices<before.prices)failures.push('Price history count decreased');
 for(const old of before.offers.filter(o=>o.status==='PUBLISHED')){
  const mapped=await db.legacyMapping.findUnique({where:{legacyType_legacyId:{legacyType:'publicOffer',legacyId:old.id}}});
  const row=mapped?await db.contentPage.findUnique({where:{id:mapped.targetId}}):null;
  if(!row||row.slug!==old.slug||row.publishStatus!=='PUBLISHED')failures.push(`Offer route not preserved: ${old.id}`);
 }
 return {passed:failures.length===0,failures,counts:{products:after.products.length,pages:after.pages.length,clicks:after.clicks,prices:after.prices,subscribers:after.subscribers}};
}
