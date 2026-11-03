import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ShoppingContextProvider,useShoppingContext} from '../../shared/components/shopping-context-provider';
import {ShoppingPreferences} from '../../shared/components/shopping-preferences';
import {CatalogFiltersPanel} from '../../shared/components/catalog-filters';
import {parseCatalogFilters,PRICE_BANDS} from '../../shared/lib/catalog-filters';

vi.stubGlobal('React',React);
const state=vi.hoisted(()=>({query:''}));
vi.mock('next/navigation',()=>({usePathname:()=>'/en',useSearchParams:()=>new URLSearchParams(state.query)}));
vi.mock('next-intl',()=>({useLocale:()=>'en'}));
vi.mock('../../i18n/navigation',()=>({Link:({children,href,...props}:React.ComponentProps<'a'> & {href:unknown})=><a {...props} href={typeof href==='string'?href:JSON.stringify(href)}>{children}</a>}));

function ContextReadout(){const context=useShoppingContext();return <output>{JSON.stringify(context)}</output>;}
describe('rendered shopping preference consumers',()=>{
 it('uses the saved context for both controls and consumers, without changing language',()=>{
  state.query='';
  const html=renderToStaticMarkup(<ShoppingContextProvider saved={{shipTo:'US',currency:'USD'}}><ShoppingPreferences/><ContextReadout/></ShoppingContextProvider>);
  expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>United States<\/button>/);
  expect(html).toContain('&quot;shipTo&quot;:&quot;US&quot;');
  expect(html).toContain('&quot;displayCurrency&quot;:&quot;USD&quot;');
  expect(html).toContain('&quot;locale&quot;:&quot;en&quot;');
 });
 it('a currency-only URL does not select a destination, and explicit clears beat saved choices',()=>{
  state.query='currency=USD';
  let html=renderToStaticMarkup(<ShoppingContextProvider saved={null}><ContextReadout/></ShoppingContextProvider>);
  expect(html).toContain('&quot;shipTo&quot;:null');
  expect(html).toContain('&quot;displayCurrency&quot;:&quot;USD&quot;');
  state.query='shipTo=&currency=';
  html=renderToStaticMarkup(<ShoppingContextProvider saved={{shipTo:'US',currency:'USD'}}><ContextReadout/></ShoppingContextProvider>);
  expect(html).toContain('&quot;shipTo&quot;:null');expect(html).toContain('&quot;displayCurrency&quot;:null');
 });
 it('keeps legacy numeric price bands in SAR and submits explicit empty context choices',()=>{
  const html=renderToStaticMarkup(<CatalogFiltersPanel filters={parseCatalogFilters({})} options={{categories:[],brands:[],bands:[PRICE_BANDS[0],PRICE_BANDS[1]],hasDiscounts:false,hasRatings:false,hasVerdicts:false}} q="" locale="en" activeCount={0} shipTo={null} currency="USD"/>);
  expect(html).toContain('Price (SAR)');expect(html).not.toContain('Price (USD)');
  expect(html).toContain('name="shipTo" value=""');expect(html).toContain('name="currency" value="USD"');
 });
 it('uses the same first repeated query value as the server page resolver',()=>{
  state.query='shipTo=SA&shipTo=US&currency=SAR&currency=USD';
  const html=renderToStaticMarkup(<ShoppingContextProvider saved={null}><ContextReadout/></ShoppingContextProvider>);
  expect(html).toContain('&quot;shipTo&quot;:&quot;SA&quot;');expect(html).toContain('&quot;displayCurrency&quot;:&quot;SAR&quot;');
 });
});
