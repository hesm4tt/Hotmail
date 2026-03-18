# Switch to Alpine for better compatibility and speed
FROM node:18-alpine

# Set the working directory
WORKDIR /app

# Copy ONLY the package files first
COPY package.json ./

# Run install (using --no-optional to avoid platform-specific errors)
RUN npm install --production --no-optional

# Copy everything else (bot.js, proxies.json, etc.)
COPY . .

# Match the port in your bot.js
EXPOSE 3000

CMD ["node", "bot.js"]
