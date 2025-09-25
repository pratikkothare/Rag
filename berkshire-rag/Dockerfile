FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build || true
EXPOSE 4111
CMD ["npm","run","dev"]



