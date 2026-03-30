# Reliv Recruitment Form — Netlify Deployment

## Project Structure

```
reliv-recruit/
├── index.html                    ← The recruitment form (static frontend)
├── netlify/
│   └── functions/
│       └── submit.js             ← Serverless backend (email handler)
├── netlify.toml                  ← Netlify build + routing config
├── package.json                  ← Dependencies for the serverless function
└── README.md
```

---

## Deploy to Netlify — Step by Step

### Step 1 — Upload your project to GitHub

1. Go to https://github.com and create a **new repository** (e.g. `reliv-recruit`)
2. Upload all files from this zip into that repository
   - You can drag & drop files directly on GitHub's web interface
   - Or use Git:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git remote add origin https://github.com/YOUR_USERNAME/reliv-recruit.git
     git push -u origin main
     ```

---

### Step 2 — Connect to Netlify

1. Go to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** and authorise Netlify
4. Select your `reliv-recruit` repository
5. Build settings (Netlify auto-detects from `netlify.toml`, leave defaults):
   - **Build command:** *(leave blank)*
   - **Publish directory:** `.`
6. Click **"Deploy site"**

---

### Step 3 — Add Environment Variables (REQUIRED for email)

1. In your Netlify dashboard go to:
   **Site → Site configuration → Environment variables**
2. Click **"Add a variable"** and add these two:

   | Key          | Value                              |
   |--------------|------------------------------------|
   | `GMAIL_USER` | `your-email@gmail.com`             |
   | `GMAIL_PASS` | `your-app-password` *(no spaces)*  |

3. Click **"Save"**
4. Go to **Deploys** tab → click **"Trigger deploy"** → **"Deploy site"**
   *(Environment variables only take effect after a redeploy)*

---

### Step 4 — You're live! 🎉

Your form is now at `https://YOUR-SITE-NAME.netlify.app`

You can set a custom domain under:
**Site → Domain management → Add a domain**

---

## Gmail App Password Setup

If email sending fails, your Gmail account may need an App Password:

1. Go to your Google Account → **Security**
2. Enable **2-Step Verification** (required)
3. Go to **Security → App passwords**
4. Create a new app password for "Mail"
5. Copy the 16-character password (ignore spaces) and use it as `GMAIL_PASS`

---

## Position Rules

| Position | Rule                                          |
|----------|-----------------------------------------------|
| CEO, CFO | 🔒 Reserved — applications blocked           |
| CTO      | ⭐ Only for applicants whose first name is Jiya |
| All others | ✅ Open to all                              |

---

## Local Development (optional)

```bash
npm install -g netlify-cli
npm install
netlify dev
# → Opens at http://localhost:8888
```

Create a `.env` file for local testing:
```
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password
```
