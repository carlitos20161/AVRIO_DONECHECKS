#!/bin/bash

# Deploy backend to Cloud Run
# Make sure you're logged in: gcloud auth login
# Set your project: gcloud config set project checks-6fc3e

PROJECT_ID="checks-6fc3e"
SERVICE_NAME="newchecks-backend"
REGION="us-central1"

echo "🚀 Deploying backend to Cloud Run..."

# Build and deploy to Cloud Run
gcloud run deploy $SERVICE_NAME \
  --source ./newchecks-backend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --project $PROJECT_ID \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10

echo "✅ Backend deployed successfully!"
echo "🔗 Get the service URL with: gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'"



