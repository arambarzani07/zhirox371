# سیستەمی کاشێر — Retail OS

بناغەی نوێی سیستەمی کاشێری PC بە کوردیی سۆرانی (RTL).

## ڕووکاری PC
- لە `index.html` بە کلیککردن لەسەر 12 کارتی سەرەکی، ژێرکارتەکانی هەمان ڕیز دەکرێنەوە.
- لە پەڕەی سەرەتا هیچ دەقی ڕێنماییی زیادە نییە.
- پەڕەی زیادکردنی کاڵا، لیست، سکانی بارکۆد و سەبەتەی فرۆشتن تاقیکردنەوەی ناوخۆیین.
- لە ئێستادا داتا تەنها لە بیرگەی پەڕەکە دەمێنێت، دوای Reload نامێنێت. هیچ پارەدان و فرۆشتنی ڕاستەقینە ئەنجام نادرێت.

## کردنەوە
`index.html` لە وێبگەڕێکی نوێی PC بکەرەوە. هیچ پێویستییەک بە install یان build نییە.

## Supabase
- Project: `qcfmlyyzfykzszvtllrw` (Zhirox-New-Project).
- Migration: `retail_pc_foundation`، 7 خشتەی خاڵی؛ هەموو خشتەکان RLS ـیان چالاکە.
- ڕووکاری HTML هێشتا بە Supabase پەیوەست نەکراوە. هیچ کلیلێکی نهێنی لە GitHub دانەنراوە.
- بناغەی schema: stores, products, barcodes, customers, sales, sale_items, stock_events.
- سنوور: owner-only RLS تا دروستکردنی RBAC و atomic checkout ـی تاقیکراوە.

## ڕێڕەوی بەردەوامی
Authentication و RBAC، دواتر atomic checkout و stock transaction، لە کۆتاییدا پەیوەستکردنی Frontend بە Backend و تاقیکردنەوەکانی E2E.
