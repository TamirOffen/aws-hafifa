# AWS Task App — backend image (all versions use this same shape).
# Students build and push this image; they never edit it.
# Multi-stage: the build stage compiles TypeScript (dev deps included),
# the runtime stage ships only compiled JS + production dependencies.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# PORT and ENVIRONMENT are injected at runtime (ECS task definition), NOT baked in.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
