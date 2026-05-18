# Runbook: Slow Pages

**Severity:** P2–P1  
**Service:** Web (`babiespicks.com`) and/or API (`api.babiespicks.com`)  
**Threshold:** Pages loading in >3s (P2) or >8s (P1) for >10% of users

---

## Symptoms

- Users report pages are slow to load
- Lighthouse performance score drops below 50
- GlitchTip shows elevated API response times
- Cloudflare analytics shows increased TTFB
- AI-generated content pages taking >10s

---

## Diagnosis Steps

### 1. Run a Lighthouse audit
Open Chrome DevTools → Lighthouse → run on `https://babiespicks.com`:
- Look at: **LCP** (Largest Contentful Paint), **FID**, **CLS**, **TTFB**
- A high TTFB (>600ms) points to server-side rendering slowness
- A high LCP with low TTFB points to large assets (images, fonts)

### 2. Check API response times
```bash
# Time a product list request
time curl -s "https://api.babiespicks.com/products?limit=10" > /dev/null

# Time a single product
time curl -s "https://api.babiespicks.com/products/{slug}" > /dev/null
```
- >500ms for a list → check database queries
- >2s for any endpoint → likely N+1 query or missing index

### 3. Check for slow database queries
Look in Dokploy API logs for Prisma slow-query warnings.

Common culprits:
- Product list with too many `include` relations (translations, categories, verdict)
- Missing database index on frequently filtered columns
- N+1 queries in nested includes

### 4. Check CDN / Cloudflare caching
- Go to Cloudflare → Analytics → Cache
- Low cache hit rate (<60%) for static assets? Check cache headers.
- Check if a Cloudflare cache purge is needed after a deploy:
  ```
  Cloudflare → Caching → Purge Cache → Purge Everything
  ```

### 5. Check image sizes
- Product images served without optimization → check `ImagesModule` is working
- Use browser DevTools Network tab to check image sizes (should be <200KB per image)
- Verify `sharp` is processing images (check API logs)

### 6. Check Next.js build output
```bash
# Check bundle sizes after build
pnpm turbo build --filter=@babiespicks/web
# Review the output for large chunks (>244KB is a warning)
```

---

## Resolution Steps

### Slow API responses (DB queries)
1. Identify the slow endpoint from timing checks
2. Check the Prisma query in the service — look for missing `select` (fetching all fields unnecessarily)
3. Add a database index if the query filters by a non-indexed column:
   ```prisma
   @@index([slug])
   @@index([categoryId, status])
   ```
4. Run `prisma migrate dev` to apply the index
5. Test response time improvement

### High TTFB (SSR slow)
1. Check if the Next.js app is doing too much server-side work per request
2. Consider adding `revalidate` to static pages:
   ```typescript
   export const revalidate = 3600; // 1 hour
   ```
3. Check if ISR (Incremental Static Regeneration) is configured for product pages

### Large images
1. Verify the `ImagesModule` in the API is active and processing uploads
2. Check that the web app uses `<Image>` from `next/image` (auto-optimization)
3. Purge old unoptimized images from the CDN cache

### Large JavaScript bundles
1. Analyze the bundle:
   ```bash
   ANALYZE=true pnpm turbo build --filter=@babiespicks/web
   ```
2. Identify large dependencies and consider:
   - Dynamic imports for heavy components
   - Moving server-only code to Server Components
   - Removing unused dependencies

### CDN miss rate high
1. Check `Cache-Control` headers on API responses
2. Ensure static assets have long-lived cache headers
3. Purge Cloudflare cache and confirm it rebuilds correctly

---

## Post-Incident

- Record before/after Lighthouse scores
- Document which query or asset caused the regression
- Add a performance budget to CI if the regression was a bundle size issue
- File post-incident review if P1 (see [incident-response.md](./incident-response.md))
