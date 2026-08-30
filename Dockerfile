FROM node:22-slim

WORKDIR /usr/src/app

# Enable Yarn 4 via corepack (matches packageManager field in package.json)
RUN corepack enable

# Install deps first for better layer caching
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

# Copy app source
COPY . .

ENV NODE_ENV=production
EXPOSE 1458

CMD ["npm", "run", "start"]
