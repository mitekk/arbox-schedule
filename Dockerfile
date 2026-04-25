FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node . .
USER node
CMD ["npx", "ts-node", "schedule/scheduler.ts"]
