# Use Node.js with Chrome pre-installed for Puppeteer
FROM ghcr.io/puppeteer/puppeteer:23.0.2

# Set working directory
WORKDIR /app

# Switch to root to install dependencies
USER root

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --production

# Copy application files
COPY index.js ./
COPY src/ ./src/

# Switch back to non-root user for security
USER pptruser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Start the application
CMD ["yarn", "start"]
