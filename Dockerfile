# Build with: docker build -t monkopoly2 .
# Run with:   docker run -p 8000:8000 monkopoly2

# Stage 1 — build the Vite/React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2 — Python runtime serving the API + the built static site
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server ./server
COPY --from=frontend-build /app/dist ./server/frontend/dist

EXPOSE 8000
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
