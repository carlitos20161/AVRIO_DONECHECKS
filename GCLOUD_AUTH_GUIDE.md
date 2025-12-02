# Google Cloud Authentication Guide

This guide shows you how to authenticate with Google Cloud using both the web interface and command line.

## 🌐 Method 1: Web Interface (Google Cloud Console)

### Step 1: Access Google Cloud Console
1. Go to: **https://console.cloud.google.com**
2. Sign in with your Google account (the one associated with your project)

### Step 2: Select Your Project
1. Click the project dropdown at the top of the page
2. Select your project: **checks-6fc3e**
3. If you don't see it, you may need to be added as a member by the project owner

### Step 3: Enable Required APIs (if needed)
1. Go to **APIs & Services** > **Library**
2. Search for and enable:
   - **Cloud Run API**
   - **Cloud Build API**
   - **Firebase Admin API** (if using Firebase)

### Step 4: Create Service Account (for programmatic access)
1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Give it a name (e.g., `deployment-service`)
4. Grant roles:
   - **Cloud Run Admin**
   - **Cloud Build Editor**
   - **Storage Admin** (if needed)
5. Click **Done**
6. Click on the service account you just created
7. Go to **Keys** tab > **Add Key** > **Create New Key**
8. Choose **JSON** format
9. Download the key file (keep it secure!)

---

## 💻 Method 2: Command Line (gcloud CLI)

### Step 1: Install gcloud CLI (if not installed)

**On macOS:**
```bash
# Using Homebrew
brew install google-cloud-sdk

# Or download from:
# https://cloud.google.com/sdk/docs/install
```

**On Linux:**
```bash
# Download and install
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

**On Windows:**
- Download installer from: https://cloud.google.com/sdk/docs/install

### Step 2: Authenticate with Web Browser

**Option A: Automatic Browser Launch (Recommended)**
```bash
gcloud auth login
```
- This will automatically open your default web browser
- Sign in with your Google account
- Grant permissions when prompted
- The terminal will confirm authentication

**Option B: Manual Browser (if auto-launch doesn't work)**
```bash
gcloud auth login --no-launch-browser
```
- Copy the URL that appears
- Open it in any browser
- Sign in and authorize
- Copy the verification code back to the terminal

### Step 3: Set Your Project
```bash
gcloud config set project checks-6fc3e
```

### Step 4: Verify Authentication
```bash
# Check current account
gcloud auth list

# Check current project
gcloud config get-value project

# Test authentication
gcloud projects describe checks-6fc3e
```

### Step 5: Enable Required APIs
```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable firebase.googleapis.com
```

---

## 🔐 Method 3: Service Account Authentication (for CI/CD or servers)

If you downloaded a service account key file:

```bash
# Authenticate using service account key
gcloud auth activate-service-account --key-file=/path/to/your-service-account-key.json

# Set project
gcloud config set project checks-6fc3e

# Verify
gcloud auth list
```

**Security Note:** Never commit service account keys to git! Add them to `.gitignore`.

---

## 🔄 Switching Between Accounts

```bash
# List all authenticated accounts
gcloud auth list

# Set active account
gcloud config set account YOUR_EMAIL@example.com

# Revoke access for an account
gcloud auth revoke YOUR_EMAIL@example.com
```

---

## ✅ Quick Verification Commands

After authentication, verify everything works:

```bash
# 1. Check authentication
gcloud auth list

# 2. Check project
gcloud config get-value project

# 3. List Cloud Run services
gcloud run services list --region us-central1

# 4. Test deployment (dry run)
gcloud run deploy newchecks-backend --source ./newchecks-backend --dry-run
```

---

## 🚨 Troubleshooting

### Issue: "Permission denied" errors
**Solution:**
- Make sure you're authenticated: `gcloud auth list`
- Verify project is set: `gcloud config get-value project`
- Check you have the right IAM roles in Google Cloud Console

### Issue: Browser doesn't open
**Solution:**
```bash
# Use manual browser method
gcloud auth login --no-launch-browser
```

### Issue: "Project not found"
**Solution:**
```bash
# List available projects
gcloud projects list

# Set the correct project
gcloud config set project checks-6fc3e
```

### Issue: "API not enabled"
**Solution:**
```bash
# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

---

## 📋 Quick Reference

```bash
# Login (opens browser)
gcloud auth login

# Login (manual browser)
gcloud auth login --no-launch-browser

# Set project
gcloud config set project checks-6fc3e

# List authenticated accounts
gcloud auth list

# Set active account
gcloud config set account EMAIL

# Revoke account
gcloud auth revoke EMAIL

# Application Default Credentials (for apps)
gcloud auth application-default login
```

---

## 🔗 Useful Links

- **Google Cloud Console:** https://console.cloud.google.com
- **gcloud CLI Documentation:** https://cloud.google.com/sdk/gcloud
- **Authentication Guide:** https://cloud.google.com/sdk/docs/authorizing
- **Your Project:** https://console.cloud.google.com/home/dashboard?project=checks-6fc3e


