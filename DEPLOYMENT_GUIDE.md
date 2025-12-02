# Deployment Guide

## ✅ Frontend Deployment (COMPLETED)

The frontend has been successfully deployed to Firebase Hosting!

**Frontend URL:** https://checks-6fc3e.web.app

## 🔧 Backend Deployment to Cloud Run

### Prerequisites

1. **Authenticate with Google Cloud:**
   ```bash
   gcloud auth login
   ```

2. **Set your project (if not already set):**
   ```bash
   gcloud config set project checks-6fc3e
   ```

3. **Enable required APIs:**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   ```

### Deploy Backend

Run the deployment script:
```bash
cd /Users/carlosarroyo/newchecks
./deploy-backend.sh
```

Or deploy manually:
```bash
cd /Users/carlosarroyo/newchecks
gcloud run deploy newchecks-backend \
  --source ./newchecks-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project checks-6fc3e \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10
```

### Get Backend URL

After deployment, get the service URL:
```bash
gcloud run services describe newchecks-backend --region us-central1 --format 'value(status.url)'
```

### Update Frontend Configuration

Once you have the backend URL, update the frontend configuration to point to the Cloud Run backend URL instead of localhost.

## 📝 Notes

- The backend uses Application Default Credentials on Cloud Run, so no credential file is needed
- The frontend is already deployed and accessible at: https://checks-6fc3e.web.app
- Make sure to update CORS settings if needed to allow the frontend domain



