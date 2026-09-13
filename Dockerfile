FROM --platform=linux/amd64 node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=10000
ENV UXBENCH_HOST=0.0.0.0
ENV UXBENCH_DATA_DIR=/tmp/uxbench-data

EXPOSE 10000

CMD ["npm", "start"]
