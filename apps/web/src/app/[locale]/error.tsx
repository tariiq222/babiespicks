'use client';
import { useLocale } from 'next-intl';
export default function ErrorPage({ reset }: { reset: () => void }) { const ar = useLocale() === 'ar'; return <main className="max-w-3xl mx-auto px-5 py-16" role="alert"><h1 className="text-2xl mb-4">{ar ? 'تعذر تحميل الصفحة' : 'This page could not be loaded'}</h1><p className="text-stone mb-6">{ar ? 'حاولي مرة أخرى بعد قليل.' : 'Please try again shortly.'}</p><button onClick={reset} className="bg-sage text-cream px-5 py-3 rounded-xl">{ar ? 'إعادة المحاولة' : 'Try again'}</button></main>; }
