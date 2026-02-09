# ✅ Pre-Deployment Checklist – Hirelens

Complete this checklist before deploying to Vercel.

---

## 📋 CODE QUALITY

- [ ] No console errors in browser
- [ ] No TypeScript compilation errors
- [ ] `npm run build` completes successfully
- [ ] CSS/styling looks correct on desktop and mobile
- [ ] All images and assets load properly

---

## 🔐 SECURITY & ENVIRONMENT

- [ ] API keys are NOT committed to GitHub
- [ ] `.env.local` is in `.gitignore` ✓
- [ ] All sensitive data uses environment variables
- [ ] HTTPS is required for production
- [ ] API key has appropriate scoping (free vs paid tier)

**API Key Status:**
- [ ] Generate fresh API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- [ ] API key has available quota
- [ ] Consider enabling paid billing for production

---

## 🧪 FUNCTIONAL TESTING (LOCAL)

### AI Interviewer Module
- [ ] Can start interview session
- [ ] Camera feed displays correctly
- [ ] Microphone captures audio
- [ ] Can write code in editor
- [ ] Submit button works
- [ ] Receives AI feedback
- [ ] Interview completes successfully

### AI Classroom Module
- [ ] Can submit code
- [ ] Code is analyzed by Gemini
- [ ] Visualization renders correctly
- [ ] Steps display in order
- [ ] Data structures render (arrays, trees, graphs)

### General Features
- [ ] Page loads without errors
- [ ] Navigation works smoothly
- [ ] No infinite loading states
- [ ] Error messages are helpful
- [ ] Mobile responsive (test on phone)

---

## 📦 BUILD & DEPLOYMENT

- [ ] Build command: `npm run build` ✓
- [ ] Output directory: `dist/` ✓
- [ ] `vercel.json` is configured ✓
- [ ] `.env.example` shows required variables ✓
- [ ] All dependencies in `package.json` ✓
- [ ] Node version compatible (`18+`)

---

## 🌐 GITHUB SETUP

- [ ] Code pushed to GitHub
- [ ] Branch is `main` (or configured in Vercel)
- [ ] Meaningful commit messages
- [ ] README.md is current
- [ ] `.gitignore` includes:
  - `node_modules/`
  - `dist/`
  - `.env.local`
  - `.env`

---

## 🎯 VERCEL CONFIGURATION

- [ ] Project created on Vercel
- [ ] GitHub repo connected
- [ ] Build command verified
- [ ] Output directory verified
- [ ] Environment variable added: `GEMINI_API_KEY`
- [ ] Production domain configured (if custom domain needed)

---

## 🧪 STAGING TEST (Optional)

Before final deployment:

1. [ ] Create staging branch
2. [ ] Deploy to staging environment on Vercel
3. [ ] Run full feature tests on staging
4. [ ] Check performance (Vercel Analytics)
5. [ ] Test on multiple devices/browsers

---

## 🚀 DEPLOYMENT DAY

### Pre-Deployment
- [ ] Full code review
- [ ] All tests passing
- [ ] No uncommitted changes
- [ ] Backup current state

### During Deployment
- [ ] Watch deployment logs for errors
- [ ] Verify build completes ✓
- [ ] Check deployment URL loads
- [ ] Verify live features work

### Post-Deployment
- [ ] Full feature test on live URL
- [ ] Check console for errors
- [ ] Monitor Vercel Analytics
- [ ] Have rollback plan ready

---

## 📊 PERFORMANCE CHECKS

- [ ] Page load time < 5 seconds
- [ ] Largest Contentful Paint (LCP) < 2.5s
- [ ] Cumulative Layout Shift (CLS) < 0.1
- [ ] First Input Delay (FID) < 100ms

Check in Vercel Analytics dashboard after deployment.

---

## 📞 MONITORING & SUPPORT

After deployment, monitor:

- [ ] Error logs in Vercel Dashboard
- [ ] API quota usage in Google Cloud
- [ ] User reports/feedback
- [ ] Performance metrics

---

## 🎯 FINAL SIGN-OFF

- [ ] Developer 1 sign-off: _______________  Date: ______
- [ ] Developer 2 sign-off: _______________  Date: ______

---

## 🆘 ROLLBACK PLAN

If critical issues found:

1. Revert to previous deployment in Vercel (1-click)
2. Or locally fix + push again
3. Check deployment logs for specific errors
4. Monitor quota if API errors occur

---

<p align="center">
  ✨ Ready to deploy? Let's go! 🚀
</p>
