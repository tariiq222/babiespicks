import { z } from 'zod';
export interface ActorContext {id:string;canPublish:boolean}
const id=z.string().trim().min(1).max(200);
const slug=z.string().trim().min(1).max(200).regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u);
const https=z.url().max(2048).refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password},'HTTPS URL required');
const image=z.string().max(2048).refine(v=>/^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(v)||/^https:\/\//.test(v),'Public media path or HTTPS image required');
const locale=z.enum(['ar','en']);
const source=z.object({url:https,checkedAt:z.iso.datetime(),field:z.string().max(100),note:z.string().max(2000).optional()}).strict();
const trans=z.object({locale,name:z.string().min(1).max(1000),description:z.string().max(100000).optional(),metaTitle:z.string().max(1000).optional(),metaDescription:z.string().max(2000).optional()}).strict();
const verdict=z.object({type:z.enum(['WORTH_IT','WORTH_IT_WITH','WAIT','NOT_WORTH_IT']),overallScore:z.number().min(0).max(10),safetyScore:z.number().min(0).max(10),qualityScore:z.number().min(0).max(10),reviewsScore:z.number().min(0).max(10),priceScore:z.number().min(0).max(10),longTermScore:z.number().min(0).max(10),reasoningAr:z.string().max(10000),reasoningEn:z.string().max(10000),conditionsAr:z.array(z.string()).optional(),conditionsEn:z.array(z.string()).optional()}).strict();
const productFields={name:z.string().trim().min(1).max(1000),brand:z.string().max(200).nullable().optional(),imageUrl:image.nullable().optional(),categoryId:id.nullable().optional(),translations:z.array(trans).max(2).optional(),sources:z.array(source).max(100).optional(),specs:z.array(z.object({key:z.string().max(200),value:z.string().max(5000),locale})).max(200).optional(),verdict:verdict.optional(),reviewSummary:z.object({averageRating:z.number().min(0).max(5),totalReviews:z.number().int().nonnegative(),sentimentScore:z.number().min(-1).max(1),prosAr:z.array(z.string()).optional(),prosEn:z.array(z.string()).optional(),consAr:z.array(z.string()).optional(),consEn:z.array(z.string()).optional(),redFlags:z.array(z.string()).optional()}).strict().optional()};
const contentTrans=z.object({locale,title:z.string().trim().min(1).max(1000),content:z.string().min(1).max(200000),metaTitle:z.string().max(1000).optional(),metaDescription:z.string().max(2000).optional(),excerpt:z.string().max(5000).optional()}).strict();
const contentFields={type:z.enum(['BEST_LIST','PRODUCT_REVIEW','BUYING_GUIDE','OFFER']),translations:z.array(contentTrans).min(1).max(2),categoryId:id.nullable().optional(),imageUrl:image.nullable().optional(),productIds:z.array(id).max(100).optional(),sources:z.array(source).max(100).optional()};
const key={idempotencyKey:id};
const update={id,expectedVersion:z.number().int().positive(),allowPublishedEdit:z.boolean().optional(),...key};
const list={limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().min(0).default(0)};
export const schemas={
 bp_get_capabilities:z.object({}).strict(),
 bp_list_products:z.object({...list,status:z.enum(['DRAFT','REVIEW','PUBLISHED','ARCHIVED']).optional()}).strict(),
 bp_get_product:z.object({id}).strict(),
 bp_create_product:z.object({...productFields,slug:slug.optional(),...key}).strict(),
 bp_update_product:z.object({...z.object(productFields).partial().shape,...update}).strict(),
 bp_list_content:z.object({...list,status:z.enum(['DRAFT','REVIEW','PUBLISHED','ARCHIVED']).optional()}).strict(),
 bp_get_content:z.object({id}).strict(),
 bp_create_content:z.object({...contentFields,slug:slug.optional(),...key}).strict(),
 bp_update_content:z.object({...z.object(contentFields).partial().shape,...update}).strict(),
 bp_set_status:z.object({...update,entityType:z.enum(['product','content']),status:z.enum(['DRAFT','REVIEW','PUBLISHED','ARCHIVED']),confirm:z.literal(true)}).strict(),
 bp_list_stores:z.object(list).strict(),
 bp_upsert_store:z.object({id:id.optional(),name:z.string().min(1).max(200),slug,url:https,logoUrl:image.optional(),affiliateNetwork:z.string().max(100).optional(),isActive:z.boolean().default(true),...key}).strict(),
 bp_list_categories:z.object(list).strict(),
 bp_upsert_category:z.object({id:id.optional(),name:z.string().min(1).max(200),slug,description:z.string().max(10000).optional(),imageUrl:image.optional(),parentId:id.nullable().optional(),...key}).strict(),
 bp_list_coupons:z.object({...list,storeId:id.optional()}).strict(),
 bp_upsert_coupon:z.object({id:id.optional(),code:z.string().min(1).max(100),storeId:id,description:z.string().max(10000).optional(),discountPercent:z.number().min(0).max(100).optional(),discountAmount:z.number().nonnegative().optional(),validFrom:z.iso.datetime().optional(),validUntil:z.iso.datetime().optional(),status:z.enum(['ACTIVE','EXPIRED','NEEDS_REVIEW','USED_UP','INVALID']).default('ACTIVE'),verified:z.boolean().default(false),...key}).strict(),
 bp_record_price:z.object({productId:id,storeId:id,amount:z.number().positive().max(99999999),currency:z.literal('SAR').default('SAR'),sourceUrl:https,checkedAt:z.iso.datetime(),inStock:z.boolean().default(true),...key}).strict(),
 bp_upload_image:z.object({base64:z.string().min(1).max(1400000),mimeType:z.enum(['image/png','image/jpeg','image/webp']),...key}).strict(),
 bp_get_click_stats:z.object({days:z.number().int().min(1).max(365).default(7),productId:id.optional()}).strict(),
} as const;
export type ToolName=keyof typeof schemas;
export const TOOL_DEFINITIONS=Object.entries(schemas).map(([name,schema])=>({name,description:({bp_set_status:'Change product/content publication status. Requires owner publishing grant, current expectedVersion and confirm:true.',bp_record_price:'Record a sourced price observation only; never changes editorial content or its publication.',bp_upload_image:'Upload a public image asset (not private draft storage).'} as Record<string,string>)[name]??name.replace(/^bp_/,'').replaceAll('_',' '),inputSchema:z.toJSONSchema(schema,{io:'input'})}));
