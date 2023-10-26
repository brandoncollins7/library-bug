# Install dependencies only when needed
FROM node:18.15-alpine as deps
ARG npm_auth_token
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /usr/src/app
COPY dist/apps/user-sockets/package*.json ./
COPY dist/apps/user-sockets/pnpm*.yaml ./
COPY .npmrc ./
RUN printf "\n //npm.staging.frnt.io/:_authToken="$npm_auth_token"" >> .npmrc
RUN npm install -g pnpm@7
RUN pnpm install --prod

# Production image, copy all the files and run nest
FROM node:18.15-alpine as runner
RUN apk add --no-cache dumb-init
ENV NODE_ENV production
ENV PORT 3000
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package.json ./package.json
COPY dist/apps/user-sockets .
RUN chown -R node:node .
USER node
EXPOSE 3000
CMD ["dumb-init", "node", "index.js"]
