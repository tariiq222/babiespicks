import React from 'react';
import Script from 'next/script';
export function AnalyticsScripts({ measurementId }: { measurementId?: string }) {
  if (!measurementId || !/^G-[A-Z0-9]{5,20}$/.test(measurementId)) return null;
  return <><Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" /><Script id="gtag-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');`}</Script></>;
}
