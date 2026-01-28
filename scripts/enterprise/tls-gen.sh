#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/tmp/enterprise/pki"

mkdir -p "$OUT_DIR"

CA_KEY="${OUT_DIR}/ca.key"
CA_CERT="${OUT_DIR}/ca.crt"

SERVER_KEY="${OUT_DIR}/localhost.key"
SERVER_CERT="${OUT_DIR}/localhost.crt"

MTLS_SERVER_KEY="${OUT_DIR}/api-mtls.key"
MTLS_SERVER_CERT="${OUT_DIR}/api-mtls.crt"

MTLS_CLIENT_KEY="${OUT_DIR}/gateway-client.key"
MTLS_CLIENT_CERT="${OUT_DIR}/gateway-client.crt"

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

if [[ ! -f "$MTLS_SERVER_KEY" || ! -f "$MTLS_SERVER_CERT" ]]; then
  echo "[tls] generating api-mtls server certificate..."

  EXT_FILE="${OUT_DIR}/api-mtls.ext"
  CSR_FILE="${OUT_DIR}/api-mtls.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=api-mtls
DNS.2=api
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$MTLS_SERVER_KEY"
  openssl req -new -key "$MTLS_SERVER_KEY" -out "$CSR_FILE" -subj "/CN=api-mtls"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$MTLS_SERVER_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

if [[ ! -f "$MTLS_CLIENT_KEY" || ! -f "$MTLS_CLIENT_CERT" ]]; then
  echo "[tls] generating gateway client certificate..."

  EXT_FILE="${OUT_DIR}/gateway-client.ext"
  CSR_FILE="${OUT_DIR}/gateway-client.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$MTLS_CLIENT_KEY"
  openssl req -new -key "$MTLS_CLIENT_KEY" -out "$CSR_FILE" -subj "/CN=law-eye-gateway"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$MTLS_CLIENT_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

echo "[tls] ok:"
echo "  CA cert:      $CA_CERT"
echo "  Server cert:  $SERVER_CERT"
echo "  Server key:   $SERVER_KEY"
echo "  mTLS server:  $MTLS_SERVER_CERT"
echo "  mTLS key:     $MTLS_SERVER_KEY"
echo "  mTLS client:  $MTLS_CLIENT_CERT"
echo "  mTLS ckey:    $MTLS_CLIENT_KEY"
