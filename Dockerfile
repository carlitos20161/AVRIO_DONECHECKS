FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY newchecks-frontend/package*.json ./
RUN npm install

# Copy frontend source
COPY newchecks-frontend/ ./

# Build the app
RUN npm run build

# Install serve to serve the built app
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Start the app
CMD ["serve", "-s", "build", "-l", "3000", "--host", "0.0.0.0"]
