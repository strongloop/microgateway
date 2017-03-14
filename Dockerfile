FROM tatsushid/tinycore-node:6.6
ENV NODE_ENV production

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV REGISTRY http://9.10.79.72:4873/
# ENV REGISTRY http://apiconnect01.rchland.ibm.com:4873/
COPY package.json /usr/src/app/
RUN npm config set registry $REGISTRY \
  && npm install --production

COPY . /usr/src/app

EXPOSE 3000

CMD [ "npm", "start" ]
