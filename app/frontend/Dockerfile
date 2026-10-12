# Stages:
#   deps     installs npm dependencies
#   test     deps + source, runs the test suite (never shipped)
#   build    deps + source, produces the static bundle
#   runtime  NGINX serving the bundle (default target, contains no Node.js)

FROM node:22-alpine AS deps

WORKDIR /app
RUN chown node:node /app
USER node

# Manifests are copied before the source so this layer is rebuilt only when
# dependencies change. npm ci gives reproducible installs once
# package-lock.json is committed.
COPY --chown=node:node package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi


FROM deps AS test

COPY --chown=node:node . .
CMD ["npm", "test"]


FROM deps AS build

COPY --chown=node:node . .
RUN npm run build


# Runs as UID 101 and listens on 8080, so it needs no root and no capabilities.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime

LABEL org.opencontainers.image.title="taskboard-frontend" \
      org.opencontainers.image.description="TaskBoard web UI (React, served by NGINX)"

# Pick up OS security fixes published after the base image was built.
USER root
RUN apk upgrade --no-cache

# The image's entrypoint renders this template into /etc/nginx/conf.d at start.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the entrypoint export the container's
# DNS servers as NGINX_LOCAL_RESOLVERS, which the config template uses.
ENV BACKEND_URL=http://backend:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

USER 101:101

EXPOSE 8080

# /healthz is answered by NGINX itself, so it does not depend on the backend.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
