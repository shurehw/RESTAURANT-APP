# OpsOS Setup Instructions

## ✅ Step 1: Dependencies Installed

Dependencies have been installed successfully!

## 🔧 Step 2: Supabase Setup Options

You have **two options** for setting up the database:

### Option A: Supabase Cloud (Recommended for Quick Start)

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "Start your project"
   - Create a new project (takes ~2 minutes)

2. **Apply Schema**
   - Go to your project → **SQL Editor**
   - Click "New query"
   - Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
   - Paste into the SQL Editor
   - Click "Run" (takes 30-60 seconds)

3. **Get API Keys**
   - Go to **Settings** → **API**
   - Copy:
     - Project URL
     - `anon` `public` key
     - `service_role` `secret` key

4. **Configure Environment**
   ```bash
   # Copy the example file
   copy .env.example .env.local

   # Edit .env.local and add your keys:
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

5. **Run the App**
   ```bash
   npm run dev
   ```

6. **Visit** http://localhost:3000

---

### Option B: Local Supabase (Docker Required)

**Prerequisites:**
- Docker Desktop must be installed and running
- Supabase CLI (install via one of these methods):

**Install Supabase CLI on Windows:**

**Using Scoop (Recommended):**
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Using npm (as dev dependency):**
```bash
npm install supabase --save-dev
npx supabase --version
```

**Manual Download:**
Download from: https://github.com/supabase/cli/releases

**After Installing Supabase CLI:**

1. **Initialize Supabase**
   ```bash
   npx supabase init
   ```

2. **Start Local Instance**
   ```bash
   npx supabase start
   ```

   This will output:
   - API URL: `http://localhost:54321`
   - Anon key
   - Service role key
   - Studio URL: `http://localhost:54323`

3. **Apply Schema**
   ```bash
   npx supabase db reset
   ```

4. **Configure Environment**
   ```bash
   copy .env.example .env.local

   # Edit .env.local with the keys from step 2
   ```

5. **Run the App**
   ```bash
   npm run dev
   ```

---

## 🚀 Current Status

- ✅ **Dependencies installed** (560 packages)
- ⏳ **Waiting for Supabase setup** (choose Option A or B above)
- ⏳ **Environment configuration**
- ⏳ **Development server**

## 📝 Quick Commands Reference

```bash
# Development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## 🔍 Verify Installation

Once you've completed the setup:

1. **Check Database**
   - Visit Supabase Studio (cloud or `http://localhost:54323`)
   - Go to **Table Editor**
   - You should see 30+ tables

2. **Check Application**
   - Visit http://localhost:3000
   - You should see the OpsOS dashboard
   - Navigate to `/budget` to see the sample declining budget chart

## 🐛 Troubleshooting

### Issue: npm audit vulnerability

The vulnerability is in a development dependency and doesn't affect production. You can ignore it or run:
```bash
npm audit fix
```

### Issue: Port 3000 already in use

Change the port:
```bash
# Windows
set PORT=3001 && npm run dev

# Or edit package.json dev script
"dev": "next dev -p 3001"
```

### Issue: Supabase connection errors

1. Check `.env.local` has correct keys
2. Verify Supabase project is running (cloud or local)
3. Check network/firewall settings

---

## 📚 Next Steps After Setup

1. **Explore the Platform**
   - Dashboard: Overview of venues and budgets
   - Invoices: Upload and manage invoices
   - Budget: View declining budget charts
   - Items: Browse the item master catalog

2. **Add Real Data**
   - Add your vendors
   - Import your item catalog
   - Create recipes
   - Set up budgets for current week

3. **Configure Integrations**
   - Add Toast API credentials
   - Add Square API credentials
   - Test POS sync

4. **Build Remaining Pages**
   - Invoice upload UI
   - Item master grid
   - Inventory count pages
   - Recipe editor

---

## 🎯 You're Almost There!

Choose **Option A (Supabase Cloud)** for the fastest setup, or **Option B (Local)** for full control during development.

Questions? Check:
- **README.md** - Full documentation
- **GETTING_STARTED.md** - Detailed setup guide
- **QUICK_REFERENCE.md** - Commands and queries cheat sheet
