'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {usePathname} from 'next/navigation';
import {Link} from '../../i18n/navigation';
import {ProductImage} from './product-image';
import {SarPrice} from './sar-price';
import {Tag} from './tags';

interface Card {id:string;slug:string;name:string;imageUrl:string|null;price:number;originalPrice:number|null;discount:number;storeName:string|null;verdictLabel:string|null;verdictScore:number|null;shopperRating:number|null}
interface Coupon {id:string;code:string;storeName:string;storeSlug:string;description:string|null;verified:boolean}
interface Reply {kind:string;text:string;products:Card[];coupons:Coupon[];suggestions:string[]}
interface Turn {role:'user'|'assistant';content:string;products?:Card[];coupons?:Coupon[]}

const STORAGE_KEY='bp-chat-v1';const MAX_CHARS=500;const MAX_USER_TURNS=20;
const COPY={
 ar:{open:'اسألي بايبي',close:'إغلاق المحادثة',title:'بايبي',subtitle:'مساعد AI لمنتجاتنا وخصوماتنا',hello:'مرحبًا، أساعدك تختارين من منتجاتنا وخصوماتنا. وش تدورين؟',starters:['أبي لعبة لطفل 6 شهور','وش الخصومات؟','كيف تقيّمون المنتجات؟'],productStarters:['هذا يناسب أي عمر؟','وش عيوبه؟','فيه خيار أرخص؟'],placeholder:'اكتبي سؤالك',send:'إرسال',typing:'بايبي يكتب',reset:'محادثة جديدة',empty:'اكتبي رسالتك أولًا',tooLong:'الرسالة أطول من 500 حرف',failed:'ما وصلت رسالتك. جربي مرة ثانية.',busy:'رسائل كثيرة في وقت قصير. انتظري دقيقة.',limit:'وصلت حد الرسائل. ابدئي محادثة جديدة.',view:'عرض المنتج',coupon:'كوبون',verify:'تأكدي منه عند الدفع',note:'ترشيح آلي وقد يخطئ. لا تكتبي بيانات شخصية. تصل رسائلك لمزود خارج السعودية. قد نحصل على عمولة.'},
 en:{open:'Ask AI Babi',close:'Close chat',title:'AI Babi',subtitle:'AI help with our products and discounts',hello:'Hi, I can help you choose from our products and discounts. What are you looking for?',starters:['A toy for a 6 month old','Any discounts?','How do you rate products?'],productStarters:['What age does this suit?','Any downsides?','Is there a cheaper option?'],placeholder:'Type your question',send:'Send',typing:'AI Babi is typing',reset:'New chat',empty:'Type a message first',tooLong:'Message is longer than 500 characters',failed:'Your message didn’t send. Try again.',busy:'Too many messages. Wait a minute.',limit:'Message limit reached. Start a new chat.',view:'View product',coupon:'Coupon',verify:'Confirm it at checkout',note:'Automated picks can be wrong. Don’t share personal details. Messages go to a provider outside Saudi Arabia. We may earn a commission.'},
} as const;

const Avatar=()=><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage-deep text-cream"><i className="ti ti-sparkles text-base"/></span>;
export function ChatWidget(){
 const locale=useLocale()==='ar'?'ar':'en';const copy=COPY[locale];const pathname=usePathname();
 const [open,setOpen]=useState(false);const [turns,setTurns]=useState<Turn[]>([]);const [draft,setDraft]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [suggestions,setSuggestions]=useState<string[]>([]);
 const end=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);const launcher=useRef<HTMLButtonElement>(null);
 const productSlug=pathname.match(/\/products\/([^/]+)$/)?.[1];
 const decodedSlug=productSlug?decodeURIComponent(productSlug):undefined;

 useEffect(()=>{if(!open)return;try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(turns));}catch{}},[open,turns]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end'});},[turns,busy]);
 useEffect(()=>{if(!open)return;input.current?.focus();const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);launcher.current?.focus();}};window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);},[open]);

 async function send(text:string){
  const content=text.trim();
  if(busy)return;
  if(!content){setError(copy.empty);return;}
  if(content.length>MAX_CHARS){setError(copy.tooLong);return;}
  const history:Turn[]=[...turns,{role:'user',content}];
  if(history.filter(turn=>turn.role==='user').length>MAX_USER_TURNS){setError(copy.limit);return;}
  setError('');setDraft('');setSuggestions([]);setTurns(history);setBusy(true);
  try{
   const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale,...(decodedSlug?{productSlug:decodedSlug}:{}),shownProductIds:[...new Set(history.flatMap(turn=>turn.products?.map(card=>card.id)??[]))].slice(-12),messages:history.map(({role,content:value})=>({role,content:value.slice(0,2000)}))})});
   if(response.status===429){setError(copy.busy);return;}
   if(!response.ok){setError(copy.failed);return;}
   const reply=await response.json() as Reply;
   setTurns(current=>[...current,{role:'assistant',content:reply.text,products:reply.products,coupons:reply.coupons}]);setSuggestions(reply.suggestions);
  }catch{setError(copy.failed);}finally{setBusy(false);}
 }
 const openChat=()=>{try{const saved=sessionStorage.getItem(STORAGE_KEY);if(saved&&!turns.length)setTurns(JSON.parse(saved));}catch{}setOpen(true);};
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
    {(turn.products?.length||turn.coupons?.length)?<div className="space-y-2 ps-10">
     {turn.products?.map(card=><Link key={card.id} href={`/products/${card.slug}`} className="flex gap-3 rounded-2xl bg-white p-2.5 transition-colors hover:bg-cream"><div className="w-14 shrink-0"><ProductImage src={card.imageUrl??undefined} alt={card.name} radius={8} compact sizes="56px"/></div><div className="min-w-0 flex-1"><p className="line-clamp-2 text-[13px] font-medium leading-5" dir="auto">{card.name}</p><p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm"><SarPrice amount={card.price} className="font-semibold"/>{card.discount>0&&<Tag tone="deal"><bdi dir="ltr">−{card.discount}%</bdi></Tag>}</p>{card.verdictScore!==null&&<p className="mt-0.5 text-xs text-stone"><bdi dir="ltr">{card.verdictScore.toFixed(1)} / 10</bdi> {card.verdictLabel}</p>}</div></Link>)}
     {turn.coupons?.map(coupon=><Link key={coupon.id} href={`/coupons/${coupon.storeSlug}`} className="block rounded-2xl border border-dashed border-sage bg-white p-3 text-sm"><span className="font-medium">{copy.coupon} {coupon.storeName}: </span><bdi dir="ltr" className="font-semibold">{coupon.code}</bdi>{coupon.description&&<span className="mt-1 block text-xs leading-5 text-stone">{coupon.description}</span>}{!coupon.verified&&<span className="mt-1 block text-xs text-stone">{copy.verify}</span>}</Link>)}
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
