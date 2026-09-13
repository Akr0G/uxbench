FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Keep Chromium inside the image so every Fly Machine has the exact browser
# required by the audit engine, including its Linux runtime dependencies.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV UXBENCH_HOST=0.0.0.0
ENV UXBENCH_DATA_DIR=/data

EXPOSE 8080

CMD ["npm", "start"]
