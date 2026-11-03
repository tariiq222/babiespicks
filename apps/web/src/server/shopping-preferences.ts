import 'server-only';
import {cookies} from 'next/headers';
import {parseShoppingPreferences,SHOPPING_PREFERENCES_COOKIE} from '../shared/lib/shopping-context';

export async function getSavedShoppingPreferences(){
 const value=(await cookies()).get(SHOPPING_PREFERENCES_COOKIE)?.value;
 return parseShoppingPreferences(value?`${SHOPPING_PREFERENCES_COOKIE}=${value}`:null);
}
