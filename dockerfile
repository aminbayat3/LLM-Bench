# ---- Build runtime image ----
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install only prod deps first (leverages Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY --chown=node:node . .

# Environment
ENV NODE_ENV=production \
    PORT=8080

# Run as non-root user
USER node

# Expose service port
EXPOSE 8080

# Start app
CMD ["node", "index.js"]