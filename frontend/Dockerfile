FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ARG VITE_SHOW_TEST_LOGINS=false
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SHOW_TEST_LOGINS=$VITE_SHOW_TEST_LOGINS
RUN npm run build

FROM nginx:alpine AS runner
# Keep the runtime XML parser above the first Alpine release fixing CVE-2026-93990.
RUN apk add --no-cache 'libexpat>=2.8.5-r0'
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
