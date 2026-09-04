FROM node:24-alpine AS workspace

WORKDIR /workspace

COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/buyer-web/package.json apps/buyer-web/package.json
COPY apps/supplier-web/package.json apps/supplier-web/package.json
COPY apps/landing-web/package.json apps/landing-web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/eds-client/package.json packages/eds-client/package.json
COPY packages/one-c-agent/package.json packages/one-c-agent/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:4012/api
ARG NEXT_PUBLIC_BUYER_APP_URL=http://127.0.0.1:3001
ARG NEXT_PUBLIC_SUPPLIER_APP_URL=http://127.0.0.1:3002
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ARG NEXT_PUBLIC_APPLE_CLIENT_ID=
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_BUYER_APP_URL=$NEXT_PUBLIC_BUYER_APP_URL \
    NEXT_PUBLIC_SUPPLIER_APP_URL=$NEXT_PUBLIC_SUPPLIER_APP_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_APPLE_CLIENT_ID=$NEXT_PUBLIC_APPLE_CLIENT_ID \
    NEXT_PUBLIC_APPLE_REDIRECT_URI=$NEXT_PUBLIC_APPLE_REDIRECT_URI
RUN npm run db:generate && npm run build

FROM workspace AS api
EXPOSE 4000
CMD ["npm", "run", "start", "--workspace=@marketplace/api"]

FROM workspace AS admin-web
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@marketplace/admin-web"]

FROM workspace AS buyer-web
EXPOSE 3001
CMD ["npm", "run", "start", "--workspace=@marketplace/buyer-web"]

FROM workspace AS supplier-web
EXPOSE 3002
CMD ["npm", "run", "start", "--workspace=@marketplace/supplier-web"]

FROM workspace AS landing-web
EXPOSE 3003
CMD ["npm", "run", "start", "--workspace=@marketplace/landing-web"]
