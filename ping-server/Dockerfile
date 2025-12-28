# Deno ICMP Ping Server with hostname detection
FROM denoland/deno:alpine-2.1.4

# Install iputils for ping command + DNS utilities for hostname resolution
RUN apk add --no-cache iputils bind-tools

WORKDIR /app

# Copy the server file
COPY main.ts .

# Cache dependencies (none in this case, but good practice)
RUN deno cache main.ts

# Expose port
EXPOSE 8000

# Run with network permissions
CMD ["run", "--allow-net", "--allow-run", "main.ts"]
