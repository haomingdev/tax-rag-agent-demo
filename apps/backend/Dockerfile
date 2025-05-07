# Stage 1: Build the NestJS application
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./

# Install production dependencies first for better caching
RUN npm ci --omit=dev

# Copy the rest of the application source code
COPY . .

# Install all dependencies (including devDependencies) to build the application
# and then remove devDependencies
RUN npm install && \
    npm run build && \
    npm prune --omit=dev

# Stage 2: Production image
FROM node:18-alpine

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

# Copy built application and node_modules from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./

# Expose port 3000 (default NestJS port)
# Ensure this matches the port your application listens on
EXPOSE 3000

# Start the NestJS application
CMD ["node", "dist/main"]
