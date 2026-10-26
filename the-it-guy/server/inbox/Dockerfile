FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node common.mjs receiver.mjs sender.mjs worker.mjs ./
COPY --chown=node:node providers ./providers
USER node
CMD ["node", "--max-old-space-size=256", "worker.mjs"]
