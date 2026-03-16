FROM php:8.2-cli

RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    libcurl4-openssl-dev \
    && docker-php-ext-install pdo pdo_sqlite \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Railway injects $PORT at runtime; fall back to 8080 locally
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t cineshelf.futuresrelic.com"]
