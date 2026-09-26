FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY packages ./packages
COPY assets ./assets
COPY scripts ./scripts
COPY test ./test
ENV DISABLE_SYSTEM_FONTS_LOAD=1
CMD ["sh", "-c", "node --test test/cards.test.js && npm run preview:cards"]
