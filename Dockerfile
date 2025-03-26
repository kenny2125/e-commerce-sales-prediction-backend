# Use a base image with both Node.js and Python
FROM nikolaik/python-nodejs:python3.11-nodejs22

# Install system dependencies required for GL module and PostgreSQL
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
    libgles2-mesa-dev \
    # PostgreSQL dependencies
    libpq-dev \
    postgresql-client \
    gcc \
    python3-dev

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy Python requirements file
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV PORT=3000
ENV FLASK_PORT=5000

# Expose both ports
EXPOSE 3000 5000

# Start both servers
CMD ["npm", "run", "dev:all"]
