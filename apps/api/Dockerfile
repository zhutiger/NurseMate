FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @hzy/api...
COPY apps/api apps/api
COPY docs/api docs/api
RUN pnpm --filter @hzy/api prisma:generate && pnpm --filter @hzy/api build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/src ./apps/api/src
COPY --from=build /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY package.json pnpm-workspace.yaml ./
WORKDIR /workspace/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
