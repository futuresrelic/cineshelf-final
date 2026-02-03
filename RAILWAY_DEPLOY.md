# 🚂 CineShelf Railway Deployment Guide

**For:** Non-technical users who want easy GitHub-connected deployments
**Time:** ~15 minutes
**Cost:** Free tier (should cover your needs!)

---

## Why Railway?

✅ Auto-deploy from GitHub (push code = instant deployment)
✅ Environment variables (hides API keys securely)
✅ Free tier with generous limits
✅ HTTPS automatically
✅ Easy rollbacks
✅ No server management

---

## Before You Start

You'll need:
1. GitHub account (you already have this!)
2. Your current TMDB API key
3. Your current Google OAuth credentials

**Important:** Have these ready - you'll copy/paste them into Railway!

---

## Step 1: Sign Up for Railway

1. Go to: **https://railway.app/**
2. Click **"Start a New Project"** or **"Login"**
3. Click **"Login with GitHub"**
4. Authorize Railway to access your GitHub
5. ✅ You're now logged into Railway!

---

## Step 2: Create New Project from GitHub

1. Click **"New Project"**
2. Click **"Deploy from GitHub repo"**
3. If prompted, click **"Configure GitHub App"**
   - Select **"Only select repositories"**
   - Choose **"cineshelf-final"**
   - Click **"Save"**
4. Back in Railway, select **"futuresrelic/cineshelf-final"**
5. Railway will start analyzing your repository...
6. ✅ Project created!

---

## Step 3: Configure Environment Variables

This is the MOST IMPORTANT step - where we hide your API keys!

1. In your Railway project, click on your service (should say "cineshelf-final")
2. Click the **"Variables"** tab
3. Click **"+ New Variable"** for each of these:

### Add These Variables (One at a Time):

#### Variable 1: TMDB_API_KEY
```
Variable Name: TMDB_API_KEY
Value: 8039283176a74ffd71a1658c6f84a051
```
(Or use your own TMDB key if you have one)

#### Variable 2: GOOGLE_CLIENT_ID
```
Variable Name: GOOGLE_CLIENT_ID
Value: 754407099284-tqu2gj2b2ifm01ti34eqto6mejou75pr.apps.googleusercontent.com
```
(Your current Google Client ID)

#### Variable 3: GOOGLE_CLIENT_SECRET
```
Variable Name: GOOGLE_CLIENT_SECRET
Value: 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
```
(Your current Google Client Secret)

#### Variable 4: GOOGLE_REDIRECT_URI
```
Variable Name: GOOGLE_REDIRECT_URI
Value: https://YOUR-APP-NAME.up.railway.app/api/auth.php
```
⚠️ **WAIT!** Don't set this yet - we'll come back to it!

#### Variable 5: DEBUG_MODE
```
Variable Name: DEBUG_MODE
Value: false
```
(Production mode - no error display)

#### Variable 6: NODE_ENV
```
Variable Name: NODE_ENV
Value: production
```

#### Variable 7 (Optional): OPENAI_API_KEY
```
Variable Name: OPENAI_API_KEY
Value: your_openai_key_here
```
(Only if you use the AI article extraction feature)

---

## Step 4: Get Your Railway App URL

1. Click on the **"Settings"** tab
2. Scroll down to **"Domains"**
3. Click **"Generate Domain"**
4. Railway will create a URL like: `cineshelf-production-xxxx.up.railway.app`
5. **Copy this URL!** (You'll need it)

---

## Step 5: Update Google OAuth Redirect URI

Now we know your Railway URL, let's finish the configuration!

### Option A: Update in Railway Variables

1. Go back to **"Variables"** tab
2. Find **GOOGLE_REDIRECT_URI**
3. Update the value to:
   ```
   https://YOUR-RAILWAY-URL/api/auth.php
   ```
   Example: `https://cineshelf-production-a1b2.up.railway.app/api/auth.php`
4. Click **"Update"**

### Option B: Update in Google Cloud Console

You ALSO need to update Google's side:

1. Go to: **https://console.cloud.google.com/apis/credentials**
2. Find your OAuth 2.0 Client ID
3. Click on it to edit
4. Under **"Authorized redirect URIs"**:
   - Click **"+ ADD URI"**
   - Paste: `https://YOUR-RAILWAY-URL/api/auth.php`
   - Example: `https://cineshelf-production-a1b2.up.railway.app/api/auth.php`
5. Click **"Save"**

---

## Step 6: Add Persistent Storage (For Database)

CineShelf uses SQLite, which needs a persistent volume so your database doesn't disappear!

1. In Railway, click your service
2. Click the **"Settings"** tab
3. Scroll to **"Volumes"**
4. Click **"+ New Volume"**
5. **Mount Path:** `/app/cineshelf.futuresrelic.com/data`
6. Click **"Add"**
7. ✅ Your database will now persist!

---

## Step 7: Deploy!

1. Click the **"Deployments"** tab
2. Railway should already be deploying (automatic!)
3. Wait for the build to complete (~2-5 minutes)
4. Status should change from "Building" → "Success"
5. 🎉 **You're live!**

---

## Step 8: Test Your Deployment

1. Open your Railway URL in a browser:
   ```
   https://YOUR-RAILWAY-URL
   ```
2. You should see CineShelf login page!
3. Click **"Sign in with Google"**
4. Log in with your Google account
5. ✅ **It works!**

---

## Step 9: Migrate Your Existing Data (Optional)

If you have an existing CineShelf database on DreamHost:

### Download from DreamHost:
1. Log into DreamHost file manager
2. Navigate to your CineShelf directory
3. Download: `cineshelf.futuresrelic.com/data/cineshelf.sqlite`

### Upload to Railway:
Unfortunately, Railway doesn't have a simple file upload. You have two options:

**Option A: Use Railway CLI** (requires terminal)
```bash
railway login
railway link
railway run bash
# Then upload file via SFTP or other means
```

**Option B: Start Fresh**
- Let Railway create a new database
- Re-add your movies (tedious, but clean start)
- Or wait for CSV import feature

---

## Step 10: Set Up Auto-Deploy

Good news: **It's already set up!**

From now on:
1. You (or Claude) push code to GitHub
2. Railway detects the push
3. Railway automatically deploys the new code
4. 🎉 No manual steps needed!

---

## What Happens Next?

### Every Git Push:
```
You push code to GitHub
    ↓
Railway detects commit
    ↓
Railway builds new version
    ↓
Railway deploys automatically
    ↓
Your app updates live!
```

### Rolling Back (If Something Breaks):
1. Go to Railway **"Deployments"** tab
2. Find the previous working deployment
3. Click the **"..."** menu
4. Click **"Redeploy"**
5. ✅ Back to working version!

---

## Monitoring & Logs

### View Logs:
1. Click your service in Railway
2. Click **"Logs"** tab
3. See real-time logs (errors, warnings, etc.)

### Check Health:
1. Visit your Railway URL
2. If it loads = healthy!
3. Check logs for errors

---

## Cost & Limits

Railway free tier includes:
- ✅ $5 credit per month
- ✅ 500 hours of usage
- ✅ 100 GB outbound bandwidth
- ✅ 1 GB RAM per service

**Your CineShelf app should easily stay within free tier!**

If you exceed:
- Railway will email you
- Add payment method for overage (pay-as-you-go)
- Typically ~$0.000231 per GB-hour

---

## Troubleshooting

### Issue: "Build Failed"
**Solution:**
- Check Railway logs for error message
- Most common: Missing environment variable
- Verify all variables are set correctly

### Issue: "Database not found"
**Solution:**
- Check volume is mounted to `/app/cineshelf.futuresrelic.com/data`
- Railway will create database automatically on first run

### Issue: "OAuth redirect_uri_mismatch"
**Solution:**
- Double-check GOOGLE_REDIRECT_URI matches your Railway URL exactly
- Ensure you updated Google Cloud Console with Railway URL
- Remember to include `/api/auth.php` at the end!

### Issue: "Can't see my old movies"
**Solution:**
- You need to migrate database from DreamHost (see Step 9)
- Or start fresh and re-add movies

### Issue: "App won't load"
**Solution:**
- Check logs for PHP errors
- Verify all environment variables are set
- Try redeploying (click "Redeploy" button)

---

## Updating Your App (For Future Changes)

When Claude makes changes to CineShelf:

1. Claude pushes code to GitHub branch
2. You merge the branch (or Claude does it)
3. Railway auto-deploys
4. Done! ✅

**You don't need to do anything manually!**

---

## Keeping DreamHost vs Moving Completely

### Option A: Keep Both (Recommended During Transition)
- DreamHost: Stable production version
- Railway: Testing new features
- Switch when ready

### Option B: Move Completely to Railway
- Update DNS to point to Railway
- Export data from DreamHost first!
- Cancel DreamHost hosting

---

## Getting Help

### Railway Support:
- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app/
- Railway Help Center: https://help.railway.app/

### CineShelf Issues:
- Check IMPROVEMENTS.md for known issues
- Check logs in Railway dashboard
- Ask Claude for help!

---

## Security Notes

✅ **Good News:**
- API keys are now hidden in environment variables
- Not visible in GitHub repository
- Only accessible in Railway dashboard
- HTTPS automatically enabled

⚠️ **Important:**
- Never share your Railway dashboard access
- Never commit `.env` file to git (already in .gitignore)
- Regenerate secrets if exposed

---

## Next Steps After Deployment

1. ✅ Test all features (collection, wishlist, groups, trivia)
2. ✅ Migrate your data from DreamHost (if desired)
3. ✅ Update any bookmarks to new Railway URL
4. ✅ Share new URL with family/friends in groups
5. ✅ Set up custom domain (optional, see below)

---

## Bonus: Custom Domain (Optional)

Want `cineshelf.yourdomain.com` instead of Railway's URL?

1. In Railway: **Settings** → **Domains** → **Custom Domain**
2. Enter: `cineshelf.yourdomain.com`
3. Railway gives you a CNAME record
4. Add CNAME to your DNS provider:
   ```
   Type: CNAME
   Name: cineshelf
   Value: [Railway's CNAME value]
   ```
5. Wait for DNS propagation (~5-60 minutes)
6. ✅ Your custom domain works!

**Don't forget to:**
- Update `GOOGLE_REDIRECT_URI` to use new domain
- Update Google Cloud Console redirect URI

---

## Summary Checklist

Before you start:
- [ ] Railway account created
- [ ] API keys ready to copy
- [ ] GitHub repo connected

During setup:
- [ ] Project created from GitHub
- [ ] All environment variables added
- [ ] Railway URL generated
- [ ] Google OAuth redirect URI updated (both places!)
- [ ] Persistent volume added for database
- [ ] App deployed successfully

After deployment:
- [ ] Tested login with Google
- [ ] Verified collection loads
- [ ] Checked logs for errors
- [ ] (Optional) Migrated data from DreamHost
- [ ] (Optional) Set up custom domain

---

## You're Done! 🎉

Your CineShelf is now:
- ✅ Deployed on Railway
- ✅ Auto-deploying from GitHub
- ✅ API keys hidden securely
- ✅ Database persisted
- ✅ HTTPS enabled
- ✅ Ready to use!

**From now on, just push to GitHub and Railway handles the rest!**

---

**Questions?** Ask Claude - I'm here to help! 🎬

**Document Version:** 1.0
**Last Updated:** 2026-02-03
**Railway Version:** Latest
