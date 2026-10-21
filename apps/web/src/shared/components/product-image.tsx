'use client';
import Image from 'next/image';
import {useState} from 'react';
import {isProductImageUrl} from '../lib/product-details';

/** One square, contained frame for every product image, independent of source dimensions. */
export function ProductImage({src,alt='Product image',radius=12,priority=false,fill=false,className='',quality=90,sizes,compact=false}: {
 src?:string;alt?:string;width?:number;height?:number;radius?:number;priority?:boolean;fill?:boolean;className?:string;quality?:number;sizes?:string;compact?:boolean;
}){
 const [failedSrc,setFailedSrc]=useState<string>();
 const visible=src&&isProductImageUrl(src)&&failedSrc!==src;
 const optimized=!!src&&(src.startsWith('/media/')||/^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|(?:[a-z0-9-]+\.)*babiespicks\.com)\//i.test(src));
 return <div className={`${fill?'absolute inset-0':'relative'} aspect-square w-full overflow-hidden bg-white ${className}`} style={{borderRadius:radius}}>
  {visible?<Image src={src} alt={alt} fill className={`object-contain ${compact?'p-1':'p-4'}`} priority={priority} quality={quality} sizes={sizes??'(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 25vw'} unoptimized={!optimized} onError={()=>setFailedSrc(src)}/>:<div role={alt?'img':undefined} aria-label={alt||undefined} className="absolute inset-0 flex items-center justify-center bg-linen p-5 text-center text-xs leading-6 text-stone"><span>{alt}</span></div>}
 </div>;
}
