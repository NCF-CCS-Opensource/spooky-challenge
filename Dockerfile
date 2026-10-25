# All-in-one: Piston + PostgreSQL + API + web in one container. Needs --privileged (Piston sandbox).
FROM ghcr.io/engineer-man/piston:latest
RUN sed -i 's|deb.debian.org|archive.debian.org|;s|security.debian.org|archive.debian.org|;/-updates/d' /etc/apt/sources.list \
 && apt-get -o Acquire::Check-Valid-Until=false update \
 && apt-get install -y --no-install-recommends postgresql xz-utils curl ca-certificates \
 && apt-get clean
ENV NODE22=/opt/node22
RUN curl --proto '=https' --proto-redir '=https' -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz | tar -xJ \
 && mv node-v22.11.0-linux-x64 $NODE22
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN PATH=$NODE22/bin:$PATH && corepack enable && corepack prepare pnpm@10.15.0 --activate && pnpm install --frozen-lockfile
COPY apps apps
RUN PATH=$NODE22/bin:$PATH && pnpm --filter api build && pnpm --filter web build
RUN sed -e 's|chown -R piston:piston /piston && \\|chown -R piston:piston /piston|' -e 's|exec su \(.*\)|su \1 \&|' \
    /piston_api/src/docker-entrypoint.sh > /piston-entry.sh
COPY docker-aio.sh /docker-aio.sh
VOLUME ["/var/lib/postgresql", "/piston/packages"]
EXPOSE 3000
ENTRYPOINT ["/docker-aio.sh"]
