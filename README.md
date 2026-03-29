# Mizan · ميزان — Deployment Guide

## Stack
- **Next.js 14** (App Router)
- **Supabase** (Auth + PostgreSQL)
- **Vercel** (Deployment)
- **Google Calendar API** (OAuth2, read + write)

---

## Step 1 — GitHub

```bash
cd mizan-app
git init
git add .
git commit -m "init: mizan web app"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/mizan.git
git push -u origin main
```

---

## Step 2 — Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `mizan`, pick a region close to you, set a DB password
3. Go to **SQL Editor** → paste the full contents of `supabase/schema.sql` → Run
4. Go to **Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
5. Go to **Authentication → URL Configuration**:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/api/auth/callback`

---

## Step 3 — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → name it `mizan`
3. Go to **APIs & Services → Enable APIs** → enable **Google Calendar API**
4. Go to **APIs & Services → Credentials**:
   - Create OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`
     - `https://your-app.vercel.app/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret**
6. Go to **OAuth consent screen**:
   - User Type: External
   - Add your email as a test user
   - Scopes: add `https://www.googleapis.com/auth/calendar`

---

## Step 4 — Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your `mizan` repo
3. Framework: **Next.js** (auto-detected)
4. Go to **Environment Variables** and add all of these:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=https://your-app.vercel.app/api/auth/google/callback
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

5. Click **Deploy**

---

## Step 5 — Local Dev

```bash
cp .env.local.example .env.local
# Fill in .env.local with your keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How Google Calendar Works

1. Sign in to Mizan with your email/password
2. Go to **Weekly** → click **Connect Google Calendar**
3. Authorize in the popup (Calendar read + write)
4. Your events appear as orange blocks in the weekly view
5. Click **+ Time Block** on any day to push a block to Google Calendar
6. Click 🗓 next to any task to schedule it as a time block

---

## Features

| Page | What it does |
|------|-------------|
| Setup | Add/delete habits · Monthly goals |
| Calendar | Month grid · click day to log habits (Done/Miss/N/A) |
| Tracker | Habit cards with monthly day squares + streak stats |
| Weekly | Weekly goals · Daily tasks · Google Calendar events |
| 6M Goals | Big goals with milestones, % progress, color coding |
| Insights → Analytics | KPIs + 12-week trend + per-habit breakdown |
| Insights → Performance | Month-by-month table |
| Insights → Review | Weekly reflection (Win/Improve/Gratitude/Focus) |
