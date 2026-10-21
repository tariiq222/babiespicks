'use client';
import {useState} from 'react';
import {ProductImage} from './product-image';
export function ProductGallery({images,name,locale}:{images:string[];name:string;locale:string}){
 const [selected,setSelected]=useState(0);const ar=locale==='ar';
 const active=Math.min(selected,Math.max(images.length-1,0));
 return <section aria-label={ar?'صور المنتج':'Product photos'} className="min-w-0">
  <ProductImage src={images[active]} alt={name} priority sizes="(max-width: 768px) 90vw, 45vw" className="hairline"/>
  {images.length>1&&<>
   <div className="mt-4 grid grid-cols-5 gap-2" aria-label={ar?'اختيار صورة المنتج':'Choose product photo'}>{images.map((src,index)=><button key={src} type="button" aria-pressed={active===index} aria-label={ar?`عرض الصورة ${index+1} من ${images.length}`:`View photo ${index+1} of ${images.length}`} onClick={()=>setSelected(index)} className={`min-w-0 rounded-xl border-2 p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-deep ${active===index?'border-sage-deep':'border-transparent hover:border-sage'}`}><ProductImage src={src} alt="" compact radius={8} sizes="100px"/></button>)}</div>
   <p className="mt-3 text-center text-xs text-stone" aria-live="polite">{ar?`الصورة ${active+1} من ${images.length}`:`Photo ${active+1} of ${images.length}`}</p>
  </>}
 </section>;
}
