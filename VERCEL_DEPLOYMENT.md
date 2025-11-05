# Vercel Deployment Guide for ChatBridge

This guide walks you through deploying the Vercel serverless proxy to secure your Gemini API key.

## What This Does

- Moves your Gemini API key from the extension to a secure Vercel server
- Your extension calls YOUR serverless function
- The serverless function forwards requests to Gemini with your secure key
- Nobody can extract your key from the extension anymore

## Prerequisites

- A Vercel account (free): https://vercel.com
- Your Gemini API key
- Git installed

## Step-by-Step Deployment

### A. Prepare Your Repository

1. **Ensure you're in the ChatBridge directory:**
   ```powershell
   cd C:\Users\nehas\OneDrive\Desktop\ChatBridge
   ```

2. **Check git status:**
   ```powershell
   git status
   ```

3. **Commit the new API files:**
   ```powershell
   git add api/ package.json vercel.json .vercelignore
   git commit -m "Add Vercel serverless proxy for secure API calls"
   ```

4. **Push to GitHub** (if not already):
   ```powershell
   git push origin main
   ```

### B. Deploy to Vercel (Choose Method)

#### Method 1: Web UI (Recommended - Easiest)

1. **Go to https://vercel.com and sign in** with GitHub

2. **Click "Add New..." → Project**

3. **Import your ChatBridge repository**
   - Select "Naeha-S/ChatBridge"
   - Click "Import"

4. **Configure Project:**
   - Framework Preset: **Other**
   - Root Directory: **./ (leave default)**
   - Click **"Environment Variables"** section
   - Note: If you set Root Directory to `api/`, your endpoint path will be `/gemini` (not `/api/gemini`).

5. **Add Environment Variables:**
   
   Click "Add" and enter these **3 variables**:

   **Variable 1:**
   - Name: `GEMINI_API_KEY`
   - Value: `AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ`
   - Environment: Production ✓

   **Variable 2 (Recommended):**
   - Name: `EXT_KEY` (you can also use `EXT_SECRET` if you prefer)
   - Value: Generate a random string (example: `ns_s3cr3t_2025_xyz2416`)
   - Environment: Production ✓
   - **⚠️ SAVE THIS VALUE** - you'll need it in Step C

   **Variable 3 (optional for future):**
   - Name: `NODE_ENV`
   - Value: `production`
   - Environment: Production ✓

6. **Click "Deploy"**
   - Wait 1-2 minutes
   - You'll get a URL like: `https://chat-bridge-xxx.vercel.app`
   - **⚠️ SAVE THIS URL**

7. **Verify deployment:**
   - Go to your project dashboard
   - Click "Visit" to see the URL
   - Your API endpoint will be:
     - `https://YOUR-URL.vercel.app/api/gemini` (Root Directory = `./`)
     - `https://YOUR-URL.vercel.app/gemini` (Root Directory = `api/`)

#### Method 2: Vercel CLI (Alternative)

1. **Install Vercel CLI:**
   ```powershell
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```powershell
   vercel login
   ```

3. **Deploy from ChatBridge directory:**
   ```powershell
   vercel
   ```
   - Follow prompts to link project
   - Choose defaults

4. **Add environment variables:**
   ```powershell
   vercel env add GEMINI_API_KEY production
   # Paste: AIzaSyDH7q1lOI8grDht1H-WHNtsyptIiSrgogQ

   vercel env add EXT_SECRET production
   # Paste a random secret like: cb_s3cr3t_2024_xyz789
   # ⚠️ SAVE THIS VALUE
   ```

5. **Deploy to production:**
   ```powershell
   vercel --prod
   ```

6. **Get your URL:**
   ```powershell
   vercel ls
   ```
   - Note the production URL

### C. Test Your Deployment

1. **Test with PowerShell:**
   ```powershell
   $headers = @{
       "Content-Type" = "application/json"
   "x-ext-key" = "YOUR_EXT_KEY_HERE"
   }
   
   $body = @{
       endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
       body = @{
           contents = @(
               @{
                   parts = @(
                       @{ text = "Say hello!" }
                   )
               }
           )
       }
   } | ConvertTo-Json -Depth 10
   
   Invoke-RestMethod -Uri "https://YOUR-URL.vercel.app/api/gemini" -Method Post -Headers $headers -Body $body -ContentType "application/json"
   ```

   **Expected:** You should see a JSON response from Gemini

   **If you get 401:** Check your `x-ext-secret` (or `x-ext-key`) matches what you set in Vercel (ENV: `EXT_SECRET` or `EXT_KEY`)

   **If you get 500:** Check Vercel logs (Dashboard → Functions → Logs)

### D. Update Extension Configuration

Now that your proxy is deployed, you need to update the extension to use it.

**DO NOT run any code yet** - just note these values:

1. **Your Vercel URL:** `https://YOUR-URL.vercel.app`
2. **Your EXT_SECRET:** The secret you set in Vercel environment variables

The next step will update your extension code automatically to use the proxy.

## Next Steps

After deployment is confirmed:

1. ✅ Extension will be updated to call your Vercel proxy
2. ✅ Hardcoded API key will be removed from extension
3. ✅ All functionality will remain identical
4. ✅ Your key is now secure

## Security Notes

- **Rotate your Gemini API key:** Since it was in the extension code, create a new one in Google AI Studio and update the `GEMINI_API_KEY` in Vercel
- **Keep EXT_SECRET private:** Don't commit it to Git
- **Monitor usage:** Check Vercel dashboard for request logs
- **Set up alerts:** Configure Google Cloud billing alerts

## Troubleshooting

### 401 Unauthorized
- Verify `x-ext-secret` header matches Vercel environment variable
- Check spelling and extra spaces

### 405 Method Not Allowed
- Ensure you're using POST, not GET

### 500 Server Error
- Check Vercel function logs: Dashboard → Your Project → Functions → Logs
- Verify `GEMINI_API_KEY` is set correctly

### 502 Bad Gateway
- Gemini API might be down
- Check your Gemini API key is valid

## Cost & Limits

- **Vercel Free Tier:** 100GB bandwidth, 100,000 function invocations/month
- **Gemini Free Tier:** Check your Google AI Studio quota
- Set up billing alerts in both services

## Support

If deployment fails, check:
1. Vercel dashboard logs
2. GitHub repository is public or connected to Vercel
3. All environment variables are set correctly
