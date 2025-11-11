# 🚀 OpsOS Quick Start Guide

## ✅ What's Done

- ✅ npm dependencies installed (581 packages)
- ✅ Supabase CLI installed as dev dependency
- ✅ Complete database schema ready
- ✅ Next.js app configured

## ⚡ Fastest Setup (5 minutes)

Since Docker is not installed, use **Supabase Cloud** (free tier, no credit card required):

### Step 1: Create Supabase Project (2 minutes)

1. Go to **https://supabase.com/dashboard**
2. Sign in (GitHub/Google/Email)
3. Click **"New Project"**
4. Fill in:
   - **Name**: `opsos-dev`
   - **Database Password**: (create a strong password - save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free
5. Click **"Create new project"**
6. Wait ~2 minutes for provisioning

### Step 2: Apply Database Schema (1 minute)

1. In your new project, click **"SQL Editor"** in left sidebar
2. Click **"New query"**
3. Open the file: `c:\Users\JacobShure\RESTAURANT APP\supabase\migrations\001_initial_schema.sql`
4. **Copy ALL** the contents (Ctrl+A, Ctrl+C)
5. **Paste** into the Supabase SQL Editor
6. Click **"Run"** button (bottom right)
7. Wait ~30 seconds - you should see "Success. No rows returned"

### Step 3: Get API Keys (30 seconds)

1. Click **"Settings"** (gear icon in sidebar)
2. Click **"API"**
3. You'll see:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **Project API keys**:
     - `anon` `public` - This is your ANON KEY
     - `service_role` `secret` - This is your SERVICE ROLE KEY

**IMPORTANT:** Keep these keys safe! Copy them now.

### Step 4: Configure Environment (1 minute)

1. Open terminal in your project folder:
   ```bash
   cd "c:\Users\JacobShure\RESTAURANT APP"
   ```

2. Copy the environment template:
   ```bash
   copy .env.example .env.local
   ```

3. Open `.env.local` in your editor

4. Replace these lines:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_step_3
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_step_3
   ```

5. Save the file

### Step 5: Start the Application (30 seconds)

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 15.1.4
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 2.3s
```

### Step 6: Verify It Works! 🎉

1. Open **http://localhost:3000** in your browser
2. You should see the **OpsOS Dashboard**
3. Navigate to different pages:
   - **Dashboard** - Shows 2 venues (Delilah LA, Nice Guy LA)
   - **Invoices** - Empty list (ready for uploads)
   - **Budget** - Declining budget chart with sample data
   - **Items** - Will show 10 seeded items

## ✅ Success Checklist

- [ ] Supabase project created
- [ ] Schema applied (30+ tables created)
- [ ] API keys copied to `.env.local`
- [ ] `npm run dev` running without errors
- [ ] Dashboard loads at http://localhost:3000
- [ ] Can navigate between pages

## 🔍 Verify Database Setup

### In Supabase Dashboard:

1. Click **"Table Editor"** (left sidebar)
2. You should see tables like:
   - `venues`
   - `items`
   - `recipes`
   - `invoices`
   - `budgets`
   - etc.

3. Click `venues` table - you should see 2 rows:
   - Delilah LA
   - Nice Guy LA

4. Click `items` table - you should see 10 rows:
   - Espresso Beans
   - Whole Milk
   - PET Cup
   - etc.

### In Your Application:

1. Go to http://localhost:3000/budget
2. You should see a budget chart
3. Select **"Delilah LA"** from dropdown
4. Select **"kitchen"** department
5. You should see budget data for week starting 2025-11-03

## 🎯 What's Next?

Now that OpsOS is running, you can:

### Immediate

1. **Explore the Data**
   - Check the dashboard
   - Browse items in Supabase Table Editor
   - View the recipe cost rollup

2. **Customize Sample Data**
   - Change budget amounts
   - Add more items
   - Update vendor information

### This Week

1. **Build Invoice Upload**
   - Create the drag-drop UI
   - Integrate OCR service
   - Test approval workflow

2. **Complete Item Master**
   - Build the filterable grid
   - Add edit functionality
   - Implement vendor pricing tiers

3. **Add Inventory Pages**
   - Count sheet generator
   - Mobile-friendly count entry
   - Variance reporting

### Next Steps

1. **POS Integration**
   - Add Toast API credentials (`.env.local`)
   - Test sales sync
   - Map menu items to recipes

2. **Production Deployment**
   - Deploy to Vercel
   - Configure production Supabase
   - Set up monitoring

## 🐛 Troubleshooting

### "Failed to fetch" or connection errors

**Solution:**
1. Check `.env.local` has correct URL and keys
2. Verify no typos in the keys
3. Make sure Supabase project is active (dashboard.supabase.com)

### Port 3000 already in use

**Solution:**
```bash
# Edit package.json
"dev": "next dev -p 3001"

# Or set environment variable
set PORT=3001 && npm run dev
```

### Schema errors when running SQL

**Solution:**
1. Make sure you copied the **entire** file
2. Try running in smaller chunks if needed
3. Check the SQL editor for specific error messages

### Dashboard shows no data

**Solution:**
1. Verify schema was applied successfully
2. Check Supabase Table Editor for seed data
3. Check browser console for errors (F12)

## 📚 Documentation

- **README.md** - Complete architecture and features
- **GETTING_STARTED.md** - Detailed setup for all options
- **IMPLEMENTATION_STATUS.md** - What's built and what's not
- **QUICK_REFERENCE.md** - SQL queries and commands cheat sheet

## 🆘 Need Help?

If you get stuck:

1. Check browser console (F12) for errors
2. Check terminal for Next.js errors
3. Check Supabase logs (Dashboard → Logs)
4. Review the error message and search documentation

## 🎉 You're Ready!

Once you complete these 6 steps, you'll have a fully functional restaurant back-office platform running locally, connected to a cloud database with sample data.

**Total time:** ~5-10 minutes

---

**Current Status:**
- ✅ Step 1-5 preparation complete
- ⏳ Waiting for you to create Supabase project and configure keys
- ⏳ Then run `npm run dev`

Let's go! 🚀
