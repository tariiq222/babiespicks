# Email Deliverability Setup — BabiesPicks

Domain: **babiespicks.com** | DNS provider: **Cloudflare** | Email provider: **Resend**

---

## 1. DNS Records to Add in Cloudflare

All records go in Cloudflare DNS for `babiespicks.com`. Set **Proxy status = DNS only (grey cloud)** for all email-related records.

### 1.1 SPF

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `@` | `v=spf1 include:resend.com ~all` | Auto |

> If you already have an SPF record, merge the `include:resend.com` into it — there can only be one SPF TXT record on `@`.

### 1.2 DKIM (via Resend domain verification)

1. Go to **Resend dashboard → Domains → Add Domain → babiespicks.com**
2. Resend will display 3 CNAME records. Add them to Cloudflare:

| Type | Name (example) | Value (example) |
|------|----------------|-----------------|
| CNAME | `resend._domainkey` | `p.resend.com` |
| CNAME | `resend2._domainkey` | `p2.resend.com` |
| CNAME | `resend3._domainkey` | `p3.resend.com` |

> The exact record names and values are shown in your Resend dashboard after adding the domain — use those exact values.

### 1.3 DMARC

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@babiespicks.com; pct=100` | Auto |

Start with `p=none` (monitoring only). After 30 days of clean reports, escalate to `p=quarantine` then `p=reject`.

### 1.4 Return-Path / Bounce Domain (optional but recommended)

Resend can set this automatically when domain is verified. No manual record needed.

---

## 2. Resend Configuration

### 2.1 API Key

Add to `apps/api/.env` (and update `.env.example`):

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

Get your API key from **Resend dashboard → API Keys → Create API Key**.

### 2.2 Sender Addresses

Use these verified sender addresses once the domain is confirmed in Resend:

| Purpose | Address |
|---------|---------|
| Newsletters | `newsletter@babiespicks.com` |
| Transactional / welcome | `hello@babiespicks.com` |
| No-reply | `noreply@babiespicks.com` |
| Support replies | `support@babiespicks.com` |

All must use `babiespicks.com` (the verified domain). Do **not** use `gmail.com` or `resend.dev` in production.

### 2.3 Webhook Setup

1. In **Resend dashboard → Webhooks → Add Endpoint**
2. URL: `https://api.babiespicks.com/newsletter/webhook`
3. Select events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy the signing secret → set as `RESEND_WEBHOOK_SECRET` in production env

The API exposes `POST /newsletter/webhook` which receives and logs these events (see `apps/api/src/features/newsletter/newsletter.controller.ts`).

---

## 3. Verification Steps

After adding DNS records, wait up to 48 hours for propagation, then verify:

### 3.1 SPF
```
https://mxtoolbox.com/spf.aspx
→ Enter: babiespicks.com
→ Should show: resend.com in the include list ✓
```

### 3.2 DKIM
```
https://mxtoolbox.com/dkim.aspx
→ Selector: resend  (or resend2, resend3)
→ Domain: babiespicks.com
→ Should show: DKIM record found ✓
```

### 3.3 DMARC
```
https://mxtoolbox.com/dmarc.aspx
→ Enter: babiespicks.com
→ Should show: v=DMARC1 record found ✓
```

### 3.4 Resend Domain Status
In Resend dashboard → Domains, status should show **Verified** (green). If still pending after 48h, re-check CNAME records in Cloudflare.

### 3.5 End-to-end Test
Send a test email via Resend dashboard → Domains → Send Test Email. Then check:
- **mail-tester.com** — aim for score ≥ 9/10
- **MXToolbox Email Health** — no red flags

---

## 4. Email Content Best Practices

### 4.1 Spam Trigger Words to Avoid
- "FREE", "ACT NOW", "CLICK HERE", "GUARANTEED", "100% free"
- Excessive exclamation marks: `!!!`
- All-caps subject lines

### 4.2 Text-to-Image Ratio
- Aim for **60% text / 40% images** minimum
- Never send image-only emails
- All images must have meaningful `alt` text

### 4.3 Required Elements (CAN-SPAM / Saudi regulations)
- Physical mailing address or company registration
- **Unsubscribe link** in every marketing email — one-click, honored within 10 business days
- Clear sender name: "BabiesPicks" (not just an email address)
- Accurate subject line — no deceptive subjects

### 4.4 Plain Text Version
Always include a plain-text alternative alongside HTML. Resend supports `text` field alongside `html`:

```typescript
await resend.emails.send({
  from: 'newsletter@babiespicks.com',
  to: subscriber.email,
  subject: 'مرحباً بك في BabiesPicks',
  html: htmlContent,
  text: plainTextContent,  // always include this
});
```

### 4.5 Subject Line Best Practices
- **Arabic subjects:** keep under 50 characters (mobile preview)
- **English subjects:** keep under 60 characters
- Personalize where possible: `مرحباً {name}` instead of generic greetings
- A/B test subject lines using Resend broadcasts

### 4.6 List Hygiene
- Hard bounces → remove immediately from list (handled by `/newsletter/webhook`)
- Soft bounces → remove after 3 consecutive failures
- Spam complaints → unsubscribe immediately
- Inactive subscribers (no open in 6+ months) → sunset campaign before removal

---

## 5. DMARC Report Monitoring

Set up free DMARC report processing:
- **Postmark DMARC** (free): https://dmarc.postmarkapp.com
- **Google Postmaster Tools**: https://postmaster.google.com (for Gmail reputation)

After 30 days with `p=none` and clean reports, escalate:
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@babiespicks.com; pct=100
```

After another 30 days clean:
```
v=DMARC1; p=reject; rua=mailto:dmarc@babiespicks.com; pct=100
```

---

## 6. Checklist Before First Send

- [ ] SPF record added to Cloudflare
- [ ] DKIM CNAMEs added to Cloudflare (from Resend dashboard)
- [ ] DMARC TXT record added
- [ ] Domain verified in Resend dashboard (green status)
- [ ] `RESEND_API_KEY` set in production environment
- [ ] `RESEND_WEBHOOK_SECRET` set in production environment
- [ ] Webhook endpoint registered in Resend dashboard → `POST /newsletter/webhook`
- [ ] Unsubscribe link in all newsletter templates
- [ ] Plain-text version included in all emails
- [ ] Test email scores ≥ 9/10 on mail-tester.com
