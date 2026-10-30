import type {Product} from '../../shared/lib/api';
import type {ChatCatalog} from './chat-tools';

const store={id:'s1',name:'أمازون',slug:'amazon'};
function product(id:string,name:string,price:number,extra:Partial<Product>={}):Product{
 return {id,name,slug:id,brand:'Brand',imageUrl:null,isActive:true,translations:[{locale:'ar',name,description:`${name} للأطفال`,slug:id}],verdict:null,prices:[{price,originalPrice:null,currency:'SAR',storeId:'s1',store}],category:{name:'ألعاب',slug:'toys'},specs:[],reviewSummary:null,...extra};
}
const verdict=(overallScore:number):Product['verdict']=>({type:'WORTH_IT',overallScore,safetyScore:8,qualityScore:8,reviewsScore:8,priceScore:8,longTermScore:8,reasoningAr:'سبب',reasoningEn:'Reason',conditionsAr:[],conditionsEn:[]});
export const FIXTURE_PRODUCTS=[
 product('playmat','فرشة لعب سميكة',149,{ageMinMonths:0,ageMaxMonths:12,verdict:verdict(8)}),
 product('piano','صالة لعب بيانو',199,{ageMinMonths:0,ageMaxMonths:36,verdict:verdict(7.8)}),
 product('stroller','عربة أطفال خفيفة',499,{ageMinMonths:6,ageMaxMonths:48,category:{name:'التنقل',slug:'travel'},prices:[{price:499,originalPrice:599,currency:'SAR',storeId:'s1',store}]}),
 product('bottle','رضاعة مضادة للمغص',39,{category:{name:'الرضاعة',slug:'feeding'},prices:[{price:39,originalPrice:52,currency:'SAR',storeId:'s1',store}]}),
];
export const FIXTURE_CATALOG:ChatCatalog={products:async()=>FIXTURE_PRODUCTS,coupons:async()=>[{id:'c1',code:'BABY10',description:'خصم للطلب الأول',discountPercent:10,discountAmount:null,validUntil:null,verified:true,store:{name:'أمازون',slug:'amazon'}}]};
