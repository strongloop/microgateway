FROM node:6-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json index.js ./
COPY lib lib/
COPY utils utils/
COPY config config/
COPY policies policies/

ARG NPM_REGISTRY
ENV npm_config_registry ${NPM_REGISTRY:-https://registry.npmjs.com}
RUN npm install --prod --quiet --depth 0

ENV NODE_ENV production

CMD [ "node", "index.js" ]
