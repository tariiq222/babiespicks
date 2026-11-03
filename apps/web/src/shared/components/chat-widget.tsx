'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {usePathname} from 'next/navigation';
import {Link} from '../../i18n/navigation';
import {ProductImage} from './product-image';
import {MoneyPrice} from './money-price';
import {formatMoney} from '../lib/money-format';
import {Tag} from './tags';
import {restoreChatText} from '../lib/chat-history';
import {useShoppingContext} from './shopping-context-provider';

type Money={amount:string;currency:string};
type LinkContext={shipTo:'SA'|'US'|null;currency:'SAR'|'USD'|null};
/** Card money exactly as the server produced it: original, estimate, legacy fallback. */
interface Card {id:string;slug:string;name:string;imageUrl:string|null;marketplaceCode:'SA'|'US'|null;offerId:string|null;observationId:string|null;href:string;context:LinkContext;
 money:{price:Money|null;originalPrice:Money|null;convertedPrice:Money|null;legacyPrice:{amount:string;currency:'SAR'}|null;sourceId:string|null;checkedAt:string|null;taxBasis:'INCLUDED'|'EXCLUDED'|'UNKNOWN';discountPercent:string|null;legacy?:boolean};
 /** href is the server-resolved offer target for this exact observation, else the page. */
 link?:'OFFER'|'PRODUCT'|'LEGACY_PRODUCT';
 deliveryPending:boolean;storeName:string|null;verdictLabel:string|null;verdictScore:number|null;shopperRating:number|null}
interface Coupon {id:string;code:string|null;storeName:string;storeSlug:string;description:string|null;discountAmount:number|null;discountCurrency:string|null;minimumSpend:{amount:string;currency:string}|null;discountPercent:number|null;verified:boolean}
interface Reply {kind:string;text:string;products:Card[];coupons:Coupon[];suggestions:string[];contextKey:string|null;needsCurrency?:boolean}
interface Turn {role:'user'|'assistant';content:string;products?:Card[];coupons?:Coupon[];contextKey?:string|null;stale?:boolean}
const sameContext=(a:LinkContext,current:LinkContext)=>a.shipTo===current.shipTo&&a.currency===current.currency;


const STORAGE_KEY='bp-chat-v1';const MAX_CHARS=500;const MAX_USER_TURNS=20;
const COPY={
 ar:{open:'اسألي بايبي',close:'إغلاق المحادثة',title:'بايبي',subtitle:'مساعد AI لمنتجاتنا وخصوماتنا',hello:'مرحبًا، أساعدك تختارين من منتجاتنا وخصوماتنا. وش تدورين؟',starters:['أبي لعبة لطفل 6 شهور','وش الخصومات؟','كيف تقيّمون المنتجات؟'],productStarters:['هذا يناسب أي عمر؟','وش عيوبه؟','فيه خيار أرخص؟'],placeholder:'اكتبي سؤالك',send:'إرسال',typing:'بايبي يكتب',reset:'محادثة جديدة',empty:'اكتبي رسالتك أولًا',tooLong:'الرسالة أطول من 500 حرف',failed:'ما وصلت رسالتك. جربي مرة ثانية.',busy:'رسائل كثيرة في وقت قصير. انتظري دقيقة.',limit:'وصلت حد الرسائل. ابدئي محادثة جديدة.',view:'عرض المنتج',buy:'فتح العرض في المتجر',coupon:'كوبون',verify:'تأكدي منه عند الدفع',estimate:'≈ تقدير تحويل',original:'الأصلي',legacy:'سعر قديم بالريال',pending:'يحتاج التحقق من التوصيل',stale:'هذه البطاقات تخص سياقًا سابقًا؛ أرسلي طلبك مرة ثانية لعرض الأسعار الجديدة.',source:'المصدر',note:'ترشيح آلي وقد يخطئ. لا تكتبي بيانات شخصية. تصل رسائلك لمزود خارج السعودية. قد نحصل على عمولة.'},
 en:{open:'Ask AI Babi',close:'Close chat',title:'AI Babi',subtitle:'AI help with our products and discounts',hello:'Hi, I can help you choose from our products and discounts. What are you looking for?',starters:['A toy for a 6 month old','Any discounts?','How do you rate products?'],productStarters:['What age does this suit?','Any downsides?','Is there a cheaper option?'],placeholder:'Type your question',send:'Send',typing:'AI Babi is typing',reset:'New chat',empty:'Type a message first',tooLong:'Message is longer than 500 characters',failed:'Your message didn’t send. Try again.',busy:'Too many messages. Wait a minute.',limit:'Message limit reached. Start a new chat.',view:'View product',buy:'Open the offer at the store',coupon:'Coupon',verify:'Confirm it at checkout',estimate:'≈ converted estimate',original:'Original',legacy:'Legacy SAR price',pending:'Delivery needs checking',stale:'These cards belong to an earlier context. Send your request again for current prices.',source:'Source',note:'Automated picks can be wrong. Don’t share personal details. Messages go to a provider outside Saudi Arabia. We may earn a commission.'},
} as const;

/**
 * The Task 6 engine contextKey for the visitor's explicit choices, in the same shape
 * the server stamps on a reply; `locale` must match the widget's route locale.
 */
const replyKey=(current:LinkContext,locale:'ar'|'en')=>JSON.stringify([locale,current.shipTo,current.currency,'PUBLIC',null]);

/**
 * A chat product card: the original amount with its own currency, the server's
 * converted estimate underneath, and the legacy SAR fallback labelled as such.
 * Every figure comes from the reply; nothing is re-derived or re-converted here.
 */
function CardLink({card,locale}:{card:Card;locale:'ar'|'en'}){
 const copy=COPY[locale];
 const {price,convertedPrice,originalPrice,legacyPrice,taxBasis,discountPercent}=card.money;
 const original=originalPrice&&price&&originalPrice.amount!==price.amount?originalPrice:null;
 return <Link href={card.link==='OFFER'?card.href:{pathname:card.href,query:{shipTo:card.context.shipTo??'',currency:card.context.currency??''}}} className="flex gap-3 rounded-2xl bg-white p-2.5 transition-colors hover:bg-cream">
  <div className="w-14 shrink-0"><ProductImage src={card.imageUrl??undefined} alt={card.name} radius={8} compact sizes="56px"/></div>
  <div className="min-w-0 flex-1">
   <p className="line-clamp-2 text-[13px] font-medium leading-5" dir="auto">{card.name}</p>
   <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
    {price?<MoneyPrice price={price} convertedPrice={convertedPrice} locale={locale} taxBasis={taxBasis} deliveryPending={card.deliveryPending} showDeliveryNote={false} className="font-semibold"/>:null}
    {!price&&legacyPrice?<span className="inline-flex flex-col"><bdi dir="ltr" className="tabular-nums font-semibold" style={{unicodeBidi:'isolate'}}>{formatMoney(legacyPrice,locale)}</bdi><span className="text-[11px] text-stone">{copy.legacy}</span></span>:null}
    {original?<s className="text-xs text-stone tabular-nums"><bdi dir="ltr" style={{unicodeBidi:'isolate'}}>{formatMoney(original,locale)}</bdi></s>:null}
    {discountPercent&&Number(discountPercent)>0?<Tag tone="deal"><bdi dir="ltr">−{discountPercent}%</bdi></Tag>:null}
   </div>
   <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-stone">
    {card.storeName&&<span dir="auto">{card.storeName}</span>}
    {card.deliveryPending&&<span>{copy.pending}</span>}
    {card.link==='OFFER'&&<span>{copy.buy}</span>}
     {card.verdictScore!==null&&<span><bdi dir="ltr">{card.verdictScore.toFixed(1)} / 10</bdi> {card.verdictLabel}</span>}
   </p>
  </div>
 </Link>;
}
const Avatar=()=><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-deep text-cream"><i className="ti ti-sparkles text-base"/></span>;
export function ChatWidget(){
 const locale=useLocale()==='ar'?'ar':'en';const copy=COPY[locale];const pathname=usePathname();
 const [open,setOpen]=useState(false);const [turns,setTurns]=useState<Turn[]>([]);const [draft,setDraft]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [suggestions,setSuggestions]=useState<string[]>([]);
 const end=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const launcher=useRef<HTMLButtonElement>(null);
 // Pages, preferences, coupons and chat share URL overrides and saved choices.
 const context=useShoppingContext();
 const shopping:LinkContext={shipTo:context.shipTo,currency:context.displayCurrency};
 const currentKey=replyKey(shopping,locale);
 const activeKey=useRef(currentKey);
 const [turnContextKey,setTurnContextKey]=useState(currentKey);
 if(turnContextKey!==currentKey){
  setTurnContextKey(currentKey);
  setTurns(current=>current.map(turn=>({...turn,products:[],coupons:[],stale:turn.role==='assistant'})));
  setSuggestions([]);
 }
 const productSlug=pathname.match(/\/products\/([^/]+)$/)?.[1];
 const decodedSlug=productSlug?decodeURIComponent(productSlug):undefined;

 useEffect(()=>{if(!open)return;try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(turns.map(({role,content})=>({role,content}))));}catch{}},[open,turns]);
 useEffect(()=>{activeKey.current=currentKey;},[currentKey]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[turns,busy]);
 useEffect(()=>{if(!open)return;input.current?.focus();const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);launcher.current?.focus();}};window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);},[open]);

 async function send(text:string){
  const content=text.trim();
  if(busy)return;
  if(!content){setError(copy.empty);return;}
  if(content.length>MAX_CHARS){setError(copy.tooLong);return;}
  // Cards produced for another destination/currency are dropped before the request.
  const next:Turn[]=[...turns.map(turn=>({...turn,products:turn.products?.filter(card=>sameContext(card.context,shopping))})),{role:'user',content}];
  if(next.filter(turn=>turn.role==='user').length>MAX_USER_TURNS){setError(copy.limit);return;}
  setError('');setDraft('');setSuggestions([]);setTurns(next);setBusy(true);
  try{
   // The chosen destination and display currency travel explicitly with the locale;
   // the server re-parses them and nothing else (no address, no stored conversation).
   const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale,shipTo:shopping.shipTo,displayCurrency:shopping.currency,...(decodedSlug?{productSlug:decodedSlug}:{}),shownProductIds:[...new Set(next.flatMap(turn=>turn.products?.map(card=>card.id)??[]))].slice(-12),messages:next.map(({role,content:value})=>({role,content:value.slice(0,2000)}))})});
   if(response.status===429){setError(copy.busy);setTurns(turns);return;}
   if(!response.ok){setError(copy.failed);setTurns(turns);return;}
   const reply=await response.json() as Reply;
   // Cards belong to the reply's contextKey; a reply produced for another context is not
   // shown as current, and older cards that no longer match the visitor's context are marked.
   const current=replyKey(shopping,locale);
   if(activeKey.current!==current)return;
   const keep=!!reply.contextKey&&reply.contextKey===current;
   setTurns(list=>[...list.map(turn=>turn.role==='assistant'?{...turn,stale:!!turn.contextKey&&turn.contextKey!==current}:turn),{role:'assistant',content:reply.text,products:keep?reply.products.filter(card=>sameContext(card.context,shopping)):[],coupons:keep?reply.coupons:[],contextKey:reply.contextKey,stale:!keep}]);
   setSuggestions(reply.suggestions);
  }catch{setError(copy.failed);setTurns(turns);}finally{setBusy(false);}
 }
 const openChat=()=>{try{if(!turns.length)setTurns(restoreChatText(sessionStorage.getItem(STORAGE_KEY)));}catch{}setOpen(true);};
 const submit=(event:FormEvent)=>{event.preventDefault();void send(draft);};
 const reset=()=>{setTurns([]);setSuggestions([]);setError('');};
 const chips=turns.length?suggestions:decodedSlug?copy.productStarters:copy.starters;

 if(pathname.includes('/admin'))return null;
 if(!open)return <button ref={launcher} type="button" onClick={openChat} aria-label={copy.open} className={`fixed end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-sage-deep text-cream shadow-lg transition-colors hover:bg-charcoal md:bottom-6 ${decodedSlug?'bottom-24':'bottom-5'}`}><i aria-hidden="true" className="ti ti-message-chatbot text-2xl"/></button>;
 return <section role="dialog" aria-label={copy.title} dir={locale==='ar'?'rtl':'ltr'} className="fixed inset-0 z-50 flex flex-col bg-linen md:inset-auto md:bottom-6 md:end-6 md:h-[min(660px,calc(100dvh-3rem))] md:w-[400px] md:overflow-hidden md:rounded-2xl md:border md:border-beige md:shadow-xl">
  <header className="flex items-center gap-3 border-b border-beige bg-cream px-4 py-3"><Avatar/><div className="min-w-0"><h2 className="font-semibold leading-6">{copy.title}</h2><p className="truncate text-xs text-stone">{copy.subtitle}</p></div><div className="ms-auto flex shrink-0 items-center gap-1">{turns.length>0&&<button type="button" onClick={reset} className="min-h-10 rounded-lg px-2 text-xs text-sage-deep underline underline-offset-2">{copy.reset}</button>}<button type="button" onClick={()=>{setOpen(false);}} aria-label={copy.close} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-beige/60"><i aria-hidden="true" className="ti ti-x text-xl"/></button></div></header>
  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
   <div className="flex items-end gap-2"><Avatar/><p className="max-w-[80%] rounded-2xl rounded-es-md bg-white px-3.5 py-2.5 text-sm leading-6">{copy.hello}</p></div>
   {turns.map((turn,index)=>turn.role==='user'?<div key={index} className="flex justify-end"><p className="max-w-[80%] break-words rounded-2xl rounded-ee-md bg-sage-deep px-3.5 py-2.5 text-sm leading-6 text-cream" dir="auto">{turn.content}</p></div>:<div key={index} className="space-y-2">
    <div className="flex items-end gap-2"><Avatar/><p className="max-w-[80%] whitespace-pre-line break-words rounded-2xl rounded-es-md bg-white px-3.5 py-2.5 text-sm leading-6" dir="auto">{turn.content}</p></div>
    {turn.stale&&!busy&&<p className="ps-10 text-xs leading-5 text-stone">{copy.stale}</p>}
    {(turn.products?.length||turn.coupons?.length)?<div className="space-y-2 ps-10">
     {turn.contextKey===currentKey&&turn.products?.filter(card=>sameContext(card.context,shopping)).map(card=><CardLink key={card.id} card={card} locale={locale}/>)}
     {turn.contextKey===currentKey&&turn.coupons?.map(coupon=><Link key={coupon.id} href={{pathname:`/coupons/${coupon.storeSlug}`,query:{shipTo:shopping.shipTo??'',currency:shopping.currency??''}}} className="block rounded-2xl border border-dashed border-sage bg-white p-3 text-sm"><span className="font-medium">{copy.coupon} {coupon.storeName}: </span>{coupon.code?<bdi dir="ltr" className="font-semibold">{coupon.code}</bdi>:null}{coupon.description&&<span className="mt-1 block text-xs leading-5 text-stone">{coupon.description}</span>}{coupon.minimumSpend&&<span className="mt-1 block text-xs text-stone tabular-nums"><bdi dir="ltr">{formatMoney(coupon.minimumSpend,locale)}</bdi></span>}{coupon.discountAmount!==null&&coupon.discountCurrency&&<span className="mt-1 block text-xs text-stone tabular-nums"><bdi dir="ltr">{formatMoney({amount:String(coupon.discountAmount),currency:coupon.discountCurrency},locale)}</bdi></span>}{!coupon.verified&&<span className="mt-1 block text-xs text-stone">{copy.verify}</span>}</Link>)}
    </div>:null}
   </div>)}
   {busy&&<div className="flex items-end gap-2"><Avatar/><p role="status" aria-label={copy.typing} className="flex h-10 items-center gap-1 rounded-2xl rounded-es-md bg-white px-4">{[0,150,300].map(delay=><span key={delay} style={{animationDelay:`${delay}ms`}} className="h-1.5 w-1.5 rounded-full bg-stone motion-safe:animate-bounce"/>)}</p></div>}
   <div ref={end}/>
  </div>
  <div className="bg-cream">
   {!busy&&chips.length>0&&<div className="flex gap-2 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none]">{chips.map(chip=><button key={chip} type="button" onClick={()=>void send(chip)} className="min-h-9 shrink-0 rounded-full border border-beige bg-white px-3.5 text-xs hover:border-sage">{chip}</button>)}</div>}
   {error&&<p role="alert" className="px-4 pt-2 text-xs text-terracotta">{error}</p>}
   <form onSubmit={submit} className="flex items-center gap-2 px-3 pt-2.5"><input ref={input} value={draft} onChange={event=>{setDraft(event.target.value);setError('');}} maxLength={MAX_CHARS+1} placeholder={copy.placeholder} aria-label={copy.placeholder} dir="auto" className="min-h-11 min-w-0 flex-1 rounded-full border border-beige bg-white px-4 text-base md:text-sm"/><button type="submit" disabled={busy} aria-label={copy.send} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-deep text-cream disabled:opacity-60"><i aria-hidden="true" className="ti ti-send text-lg rtl:-scale-x-100"/></button></form>
   <p className="px-4 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[11px] leading-4 text-stone">{copy.note}</p>
  </div>
 </section>;
}
