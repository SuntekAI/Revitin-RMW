FROM node:22-alpine3.20

WORKDIR /usr/src/app

RUN apk add --no-cache openssl
COPY --chown=node:node package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate

RUN apk add --no-cache dcron

COPY crontab /etc/crontabs/root

RUN chmod 600 /etc/crontabs/root

CMD ["crond", "-f"]
