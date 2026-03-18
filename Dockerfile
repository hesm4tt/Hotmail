FROM node:18-slim

WORKDIR /usr/src/app

# Set npm to be less strict with SSL (fixes many build server hangs)
RUN npm config set strict-ssl false

COPY package*.json ./

# Added --no-audit to speed up and prevent some failure triggers
RUN npm install --production --no-audit

COPY . .

EXPOSE 3000

CMD [ "node", "bot.js" ]
