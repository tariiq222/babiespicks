import {getLocalizedDesc,getLocalizedName,type Product} from './api';
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

/** Split editorial prose into sentences without rewording it; decimals like 4.6 stay whole. */
export function splitSentences(value:string):string[]{
 return value.split(/(?<=[.!?؟])\s+|\n+/).map(text=>text.trim()).filter(Boolean);
}
/** Conditions sit under a "good fit if" heading, so a leading "if" would read twice. */
export function stripConditionPrefix(value:string):string {
 return value.trim().replace(/^(?:إذا|if)\s+/i,'');
}
/** Split on top-level commas only, so a bracketed list stays with its item. */
export function splitSpecList(value:string):string[]{
 const items:string[]=[];let depth=0;let current='';
 for(const char of value){
  if('(['.includes(char))depth++;
  if(')]'.includes(char))depth=Math.max(0,depth-1);
  if(!depth&&'،,؛;'.includes(char)){items.push(current);current='';}else current+=char;
 }
 return [...items,current].map(text=>text.trim()).filter(Boolean);
}
const SPEC_IDENTIFIER=/^(asin|upc|ean|gtin|sku|mpn|barcode|model(?: number)?|رقم الطراز|رقم الموديل|الباركود)$/i;
/** Facts a buyer compares come first; catalogue identifiers stay available but out of the way. */
export function groupSpecs<T extends {key:string;value:string}>(specs:T[]):{facts:T[];details:T[];identifiers:T[]} {
 const identifiers=specs.filter(spec=>SPEC_IDENTIFIER.test(spec.key.trim()));
 const rest=specs.filter(spec=>!SPEC_IDENTIFIER.test(spec.key.trim()));
 const isShort=(spec:T)=>spec.value.length<=40;
 return {facts:rest.filter(isShort),details:rest.filter(spec=>!isShort(spec)),identifiers};
}

export function getProductMetaDescription(product:Product,locale:string):string {
 const ar=locale==='ar';const name=getLocalizedName(product,locale);
 const intro=organizeProductDescription(getLocalizedDesc(product,locale)).split(/\n\s*\n/).find(block=>block.trim()&&!block.trim().startsWith('#'))??'';
 const text=intro.replace(/[*_`>]/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
 if(!text)return ar?`سعر ${name} وتقييمه في بيبيز بيكس.`:`${name}: price and ratings on BabiesPicks.`;
 return text.length>155?`${text.slice(0,154).trimEnd()}…`:text;
}
export function getVerdictLabel(type:NonNullable<Product['verdict']>['type'],locale:string):string {
 return ({WORTH_IT:['يستاهل','Worth it'],WORTH_IT_WITH:['يستاهل بشرط','Worth it with conditions'],WAIT:['انتظري','Wait'],NOT_WORTH_IT:['ما يستاهل','Not worth it']} as const)[type]?.[locale==='ar'?0:1]??'';
}
