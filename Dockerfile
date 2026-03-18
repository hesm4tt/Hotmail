# Use the official Node.js 18 image as the base
FROM node:18-slim

# Create and define the application directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to cache layers
COPY package*.json ./

# Install dependencies defined in your package.json
RUN npm install --production

# Copy the rest of your application code (bot.js, etc.)
COPY . .

# Expose the port used by the Express health-check server
EXPOSE 3000

# Command to start your Discord bot
CMD [ "node", "bot.js" ]
