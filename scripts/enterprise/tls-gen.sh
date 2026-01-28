#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/tmp/enterprise/pki"

mkdir -p "$OUT_DIR"

CA_KEY="${OUT_DIR}/ca.key"
CA_CERT="${OUT_DIR}/ca.crt"

SERVER_KEY="${OUT_DIR}/localhost.key"
SERVER_CERT="${OUT_DIR}/localhost.crt"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  echo "[tls] generating local CA..."
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$CA_KEY"
  openssl req -x509 -new -key "$CA_KEY" -sha256 -days 3650 -out "$CA_CERT" \
    -subj "/CN=LawSaw Local Dev CA"
fi

if [[ ! -f "$SERVER_KEY" || ! -f "$SERVER_CERT" ]]; then
  echo "[tls] generating localhost server certificate..."

  EXT_FILE="${OUT_DIR}/localhost.ext"
  CSR_FILE="${OUT_DIR}/localhost.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=localhost
IP.1=127.0.0.1
IP.2=::1
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$SERVER_KEY"
  openssl req -new -key "$SERVER_KEY" -out "$CSR_FILE" -subj "/CN=localhost"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$SERVER_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

echo "[tls] ok:"
echo "  CA cert:      $CA_CERT"
echo "  Server cert:  $SERVER_CERT"
echo "  Server key:   $SERVER_KEY"
