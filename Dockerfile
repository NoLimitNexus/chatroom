# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose port 3000 so the NAS can route traffic to it
EXPOSE 3000

# Start the game server
CMD ["node", "server.js"]
