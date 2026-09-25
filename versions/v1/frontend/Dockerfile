# AWS Task App — frontend image.
# Multi-stage: build the React app with Vite, then serve the static output
# with nginx. The nginx config is intentionally dumb — no proxying, no API
# knowledge. In AWS, the ALB (Stage 4) does the routing; nginx only serves files.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
