# Use a base image with both Node.js and Python that matches your local versions
FROM nikolaik/python-nodejs:python3.11-nodejs22

# Install system dependencies required for GL module
RUN apt-get update && apt-get install -y \
    libgl1-mesa-dev \
    libgl1-mesa-glx \
    libxi-dev \
    libx11-dev \
    xvfb \
    libxinerama-dev \
    libxcursor-dev \
    libxrandr-dev \
    libxi-dev \
    libudev-dev \
    libgles2-mesa-dev

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies in a specific order with correct flags
RUN npm install

# RUN npm rebuild

# Copy application code
COPY . .

# Set environment variables
# ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start Xvfb and your application (needed for headless GL support)
CMD ["npm", "start"]
