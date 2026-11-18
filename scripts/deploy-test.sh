#!/usr/bin/env sh
set -eu

ROOT=/apps/NurseMate/current
ENV_FILE=/apps/NurseMate/shared/env/test.env
COMPOSE_FILE="$ROOT/infra/docker/compose.test.yml"

cd "$ROOT"
set -a
. "$ENV_FILE"
set +a
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build \
  --build-arg HTTP_PROXY="${BUILD_PROXY:-}" \
  --build-arg HTTPS_PROXY="${BUILD_PROXY:-}"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api pnpm prisma:migrate:deploy
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api pnpm seed
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api gateway
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
