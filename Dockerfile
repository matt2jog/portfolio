# syntax=docker/dockerfile:1.7

ARG INFISICAL_CLI_IMAGE=infisical/cli:0.43.116@sha256:00a7164287e70cbf513445db1cb81476cc7937fce522aca3ce51a83d80fb10db
ARG BUSYBOX_IMAGE=busybox:1.37.0-uclibc@sha256:8d7b1636e974e0adfd8d945955fca609304f0a56c18799dfd032d6e661382d84

FROM ${INFISICAL_CLI_IMAGE} AS infisical-cli
FROM ${BUSYBOX_IMAGE} AS busybox

FROM node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ARG VCS_REF
RUN node -e 'if (!/^[0-9a-f]{40}$/.test(process.argv[1])) process.exit(1)' "$VCS_REF"

FROM node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS production-dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:773a62fbe24a3f8c8b24b16fd59154627f8b406737bc906f83bf1732bc8907dd AS runtime
ARG VCS_REF
LABEL org.opencontainers.image.title="portfolio" \
      org.opencontainers.image.source="https://github.com/matt2jog/portfolio" \
      org.opencontainers.image.revision="$VCS_REF"
WORKDIR /app
ENV NODE_ENV=production \
    PORTFOLIO_RELEASE_SHA="$VCS_REF"
COPY --from=infisical-cli /bin/infisical /usr/local/bin/infisical
COPY --from=busybox /bin/sh /bin/sh
COPY --chmod=0555 docker/infisical-runtime.sh /usr/local/bin/infisical-runtime
COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/legal ./legal
COPY --from=build /app/src/migrations ./migrations
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/infisical-runtime"]
CMD ["/nodejs/bin/node", "dist/index.cjs"]
