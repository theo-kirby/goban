# syntax=docker/dockerfile:1.7

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json webpack.config.js ./
COPY src ./src
COPY examples ./examples
COPY assets ./assets

RUN yarn run build-production

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*

COPY --from=build /app/build/sandbox.min.js      /usr/share/nginx/html/sandbox.min.js
COPY --from=build /app/build/sandbox.min.js.map  /usr/share/nginx/html/sandbox.min.js.map
COPY --from=build /app/examples/examples.css     /usr/share/nginx/html/examples.css
COPY --from=build /app/assets/img                /usr/share/nginx/html/img

COPY docker/index.html              /usr/share/nginx/html/index.html
COPY docker/nginx.conf.template     /etc/nginx/templates/default.conf.template

ENV PORT=8080
EXPOSE 8080
