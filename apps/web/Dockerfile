FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The API address is fixed into the build (Next.js rewrites). Default = the 'api' service in docker-compose.
ARG API_URL=http://api:4000
# Company name shown in the app (white-label). Fixed into the build.
ARG NEXT_PUBLIC_BRAND_NAME="Hamdan Properties"
ARG NEXT_PUBLIC_BRAND_SHORT="Hamdan Properties"
ARG NEXT_PUBLIC_BRAND_TAGLINE="Property Management System"
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME NEXT_PUBLIC_BRAND_SHORT=$NEXT_PUBLIC_BRAND_SHORT NEXT_PUBLIC_BRAND_TAGLINE=$NEXT_PUBLIC_BRAND_TAGLINE
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
