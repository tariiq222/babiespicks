'use client';
import {createContext,useContext} from 'react';
import {useLocale} from 'next-intl';
import {useSearchParams} from 'next/navigation';
import {resolveShoppingContext,type ShoppingContextCookie} from '../lib/shopping-context';

const SavedPreferences=createContext<ShoppingContextCookie|null>(null);
export function ShoppingContextProvider({saved,children}:{saved:ShoppingContextCookie|null;children:React.ReactNode}){
 return <SavedPreferences.Provider value={saved}>{children}</SavedPreferences.Provider>;
}
/** One reactive context for the selectors, coupons and shopping assistant. */
export function useShoppingContext(){
 const locale=useLocale()==='ar'?'ar':'en';
 const params=useSearchParams();
 const saved=useContext(SavedPreferences);
 const query=Object.fromEntries(['shipTo','currency','maxAmount','budgetCurrency'].map(key=>[key,params.get(key)??undefined]));
 return resolveShoppingContext({locale,query,cookie:saved});
}
