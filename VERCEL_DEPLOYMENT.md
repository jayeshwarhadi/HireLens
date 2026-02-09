# 🚀 Vercel Deployment Guide – Hirelens

This guide will walk you through deploying Hirelens to Vercel in 5 minutes.

---

## 📋 Prerequisites

- GitHub account
- Vercel account (free at [vercel.com](https://vercel.com))
- Google Gemini API key (from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey))
- Project pushed to GitHub

---

## ⚡ Step 1: Push to GitHub

1. Initialize git (if not already done):
```bash
git init
git add .
git commit -m "Initial commit: Hirelens deployment ready"
```

2. Create a new GitHub repository
3. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/hirelens.git
git branch -M main
git push -u origin main
```

---

## 🔧 Step 2: Set Up on Vercel

### Option A: Import from GitHub (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Select your GitHub repo (`hirelens`) and click **Import**

### Option B: Deploy via Vercel CLI

```bash
npm i -g vercel
vercel
```

---

## 🔑 Step 3: Configure Environment Variables

### In Vercel Dashboard:

1. Go to your project settings
2. Click **"Environment Variables"**
3. Add the following:

| Key | Value | Environments |
|-----|-------|--------------|
| `GEMINI_API_KEY` | Your API key from Google AI Studio | All |

### ⚠️ How to Get Your API Key:

1. Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Copy the key
4. Paste it in Vercel environment variables

---

## 🎯 Step 4: Configure Build Settings

Vercel should auto-detect these, but verify:

| Setting | Value |
|---------|-------|
| **Framework** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

If needed, override in project settings → **Build & Development Settings**.

---

## ✅ Step 5: Deploy

1. **Automatic Deployment**: Every push to `main` branch auto-deploys
2. **Manual Deployment**: Click **"Deploy"** button in dashboard
3. **Preview Deployments**: Every PR gets a preview URL

### Deployment Status:
- Check the **"Deployments"** tab
- Wait for "Ready" status ✅
- You'll get a live URL like: `https://hirelens-xxx.vercel.app`

---

## 🧪 Testing After Deployment

Once deployment is complete:

1. **Visit your live URL**
2. **Test AI Interviewer**:
   - Allow camera & microphone permissions
   - Start interview
   - Submit a code solution
3. **Test AI Classroom**:
   - Submit sample code
   - Verify visualization renders

---

## 🚨 Troubleshooting

### ❌ "GEMINI_API_KEY is undefined"

**Solution**: 
- Verify API key is set in Vercel Environment Variables
- Redeploy after setting variables
- Check variable syntax (exact name: `GEMINI_API_KEY`)

### ❌ Build fails with "Module not found"

**Solution**:
- Push latest code to GitHub
- Check `package.json` includes all dependencies
- Run `npm install` locally to verify

### ❌ "Quota exceeded" error

**Solution**:
- Generate a new API key from Google AI Studio
- Update in Vercel Environment Variables
- Redeploy

### ❌ Large bundle size warning

**Note**: This is a warning, not an error. The build succeeds. To optimize: consider code-splitting in a future update.

---

## 📊 Monitoring & Analytics

In Vercel Dashboard:

- **Analytics**: Track page views, response times
- **Logs**: View real-time function logs
- **Monitoring**: Check deployment health

---

## 🔄 Continuous Deployment Workflow

```
1. Make code changes locally
2. Commit & push to GitHub
3. Vercel auto-detects push
4. Build runs automatically
5. Tests pass (if configured)
6. Deploy to production
7. Live within 1-2 minutes
```

---

## 🛡️ Security Best Practices

- ✅ Never commit `.env.local` (already in `.gitignore`)
- ✅ Use Vercel Environment Variables for secrets
- ✅ Rotate API keys regularly
- ✅ Monitor usage in Google Cloud Console
- ✅ Enable billing if expecting high traffic

---

## 💰 Cost Estimates

| Service | Free Tier | Cost |
|---------|-----------|------|
| **Vercel Hosting** | 100 GB bandwidth/month | Free |
| **Google Gemini API** | 60 req/min (free) | $0.075/1K input tokens |
| **Total Monthly** | Low usage | ~$5-15 |

---

## 📞 Support

- **Vercel Docs**: https://vercel.com/docs
- **Vite Docs**: https://vitejs.dev
- **Google Gemini API**: https://ai.google.dev

---

<p align="center">
  ✨ Your Hirelens platform is now live! 🎉
</p>
