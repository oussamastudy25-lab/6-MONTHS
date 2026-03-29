# Mizan · Deployment Guide
## Stack: Next.js 14 · Supabase · Vercel · Google OAuth + Calendar

---

## STEP 1 — GitHub

```bash
git init
git add .
git commit -m "Initial Mizan commit"
gh repo create mizan --private --push --source=.
# or: git remote add origin https://github.com/YOU/mizan.git && git push -u origin main
```

---

## STEP 2 — Supabase

1. Go to https://supabase.com → New project
2. **SQL Editor** → paste entire contents of `supabase/schema.sql` → Run
3. **Project Settings → API** → copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Enable Google OAuth in Supabase
4. **Authentication → Providers → Google** → Enable
5. Go to https://console.cloud.google.com → New project → **APIs & Services → Credentials**
6. Create **OAuth 2.0 Client ID** (Web application)
   - Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
7. Copy Client ID + Secret → paste into Supabase Google provider
8. **IMPORTANT: Enable Google Calendar API**
   - In Google Cloud Console → **APIs & Services → Library**
   - Search "Google Calendar API" → Enable it
9. In Supabase Google provider settings → **Scopes** → add:
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/calendar.events
   ```

---

## STEP 3 — Vercel

1. Go to https://vercel.com → Import Git Repository → select `mizan`
2. Framework: **Next.js** (auto-detected)
3. **Environment Variables** → add:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your_supabase_anon_key
   ```
4. Deploy

### Add Vercel URL to Supabase
5. **Supabase → Authentication → URL Configuration**
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/auth/callback`

### Add Vercel URL to Google OAuth
6. Google Cloud Console → your OAuth Client → add to **Authorized redirect URIs**:
   `https://your-app.vercel.app/auth/callback`

---

## STEP 4 — Local dev

```bash
cp .env.local.example .env.local
# Fill in your Supabase URL + key
npm install
npm run dev
```

---

## Checklist
- [ ] schema.sql executed in Supabase
- [ ] Google Calendar API enabled in GCP
- [ ] Supabase Google provider configured with calendar scopes
- [ ] Vercel env vars set
- [ ] Supabase redirect URLs updated with Vercel domain
- [ ] Google OAuth redirect URIs updated with Vercel domain
