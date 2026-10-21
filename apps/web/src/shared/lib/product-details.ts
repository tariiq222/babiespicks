import type {Product} from './api';
type Source=NonNullable<Product['sources']>[number];
export function isProductImageUrl(value:unknown):value is string {
 if(typeof value!=='string')return false;
 if(/^\/media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value))return true;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
export function getProductImages(product:Pick<Product,'imageUrl'|'imageUrls'>):string[]{
 return [...new Set([product.imageUrl,...(product.imageUrls??[])].filter(isProductImageUrl))];
}
function isAmazonUrl(value:string):boolean {
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['amazon.sa','www.amazon.sa','amazon.com','www.amazon.com','amazon.ae','www.amazon.ae'].includes(url.hostname);}catch{return false;}
}
export function getAmazonReviewSource(sources:Product['sources']):Source|null {
 const reviews=(sources??[]).filter(source=>source.field==='reviewSummary');
 if(!reviews.length||reviews.some(source=>!Number.isFinite(Date.parse(source.checkedAt))))return null;
 const newest=Math.max(...reviews.map(source=>Date.parse(source.checkedAt)));
 const latest=reviews.filter(source=>Date.parse(source.checkedAt)===newest);
 return latest.every(source=>isAmazonUrl(source.url))?latest[0]:null;
}
function isStoreUrl(value:string):boolean {
 if(isAmazonUrl(value))return true;
 try{return ['amzn.to','amzn.eu','noon.com','www.noon.com'].includes(new URL(value).hostname);}catch{return false;}
}
/** Keep legacy facts; separate known inline headings without rendering raw HTML. */
export function organizeProductDescription(value:string|null):string {
 return (value??'')
 .replace(/\[(?:رابط الشراء|Purchase link|Buy)\]\([^\s)]+\)/gi,'')
 .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,(match,label,url)=>isStoreUrl(url)||/^(?:buy(?:\b|$)|purchase(?:\b|$)|رابط الشراء|شراء من|اشتري|اشتريه|اشتريها)/i.test(label)?'':match)
 .replace(/(?:رابط الشراء|Purchase link|Buy)\s*:\s*https?:\/\/\S+/gi,'')
 .replace(/https?:\/\/[^\s<>\])]+/gi,url=>isStoreUrl(url)?'':url)
 .replace(/\s*(?:\*\*)?(لماذا اخترنا(?:ها|ه)|انتبهي|انتبه|Why we picked it|Please note)\s*:(?:\*\*)?\s*/gi,'\n\n### $1\n\n').trim();
}
