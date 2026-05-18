#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/../nginx/certs"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    echo "Certificates already exist at $CERT_DIR"
    echo "Delete them first if you want to regenerate."
    exit 0
fi

echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=aquasim.local/O=AquaSim" \
    2>/dev/null

chmod 600 "$CERT_DIR/server.key"
chmod 644 "$CERT_DIR/server.crt"

echo "Self-signed certificate generated at $CERT_DIR"
