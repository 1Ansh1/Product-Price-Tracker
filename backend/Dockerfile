# Official Microsoft Playwright image includes Node.js and all required Linux OS libraries for Chromium
FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install Node dependencies and ensure Chromium browser binary is present
RUN npm ci --omit=dev
RUN npx playwright install chromium

# Copy application source code
COPY . .

# Expose backend service port
ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

# Start the Express server
CMD ["node", "src/server.js"]
