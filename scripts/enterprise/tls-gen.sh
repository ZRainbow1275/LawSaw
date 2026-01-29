#!/usr/bin/env bash
set -euo pipefail

# Git Bash (MSYS2) may mistakenly convert OpenSSL `-subj "/CN=..."` into a Windows path.
# Exclude `/CN=` from argument conversion to keep OpenSSL subjects intact.
if [[ -n "${MSYS2_ARG_CONV_EXCL:-}" ]]; then
  export MSYS2_ARG_CONV_EXCL="${MSYS2_ARG_CONV_EXCL};/CN="
else
  export MSYS2_ARG_CONV_EXCL="/CN="
fi

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

VAULT_SERVER_KEY="${OUT_DIR}/vault.key"
VAULT_SERVER_CERT="${OUT_DIR}/vault.crt"

VAULT_BOOTSTRAP_CLIENT_KEY="${OUT_DIR}/vault-bootstrap-client.key"
VAULT_BOOTSTRAP_CLIENT_CERT="${OUT_DIR}/vault-bootstrap-client.crt"

VAULT_API_CLIENT_KEY="${OUT_DIR}/vault-api-client.key"
VAULT_API_CLIENT_CERT="${OUT_DIR}/vault-api-client.crt"

VAULT_WORKER_CLIENT_KEY="${OUT_DIR}/vault-worker-client.key"
VAULT_WORKER_CLIENT_CERT="${OUT_DIR}/vault-worker-client.crt"

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

if [[ ! -f "$VAULT_SERVER_KEY" || ! -f "$VAULT_SERVER_CERT" ]]; then
  echo "[tls] generating vault server certificate..."

  EXT_FILE="${OUT_DIR}/vault.ext"
  CSR_FILE="${OUT_DIR}/vault.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names

[alt_names]
DNS.1=vault
DNS.2=localhost
IP.1=127.0.0.1
IP.2=::1
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$VAULT_SERVER_KEY"
  openssl req -new -key "$VAULT_SERVER_KEY" -out "$CSR_FILE" -subj "/CN=vault"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$VAULT_SERVER_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

if [[ ! -f "$VAULT_BOOTSTRAP_CLIENT_KEY" || ! -f "$VAULT_BOOTSTRAP_CLIENT_CERT" ]]; then
  echo "[tls] generating vault bootstrap client certificate..."

  EXT_FILE="${OUT_DIR}/vault-bootstrap-client.ext"
  CSR_FILE="${OUT_DIR}/vault-bootstrap-client.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$VAULT_BOOTSTRAP_CLIENT_KEY"
  openssl req -new -key "$VAULT_BOOTSTRAP_CLIENT_KEY" -out "$CSR_FILE" -subj "/CN=law-eye-vault-bootstrap"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$VAULT_BOOTSTRAP_CLIENT_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

if [[ ! -f "$VAULT_API_CLIENT_KEY" || ! -f "$VAULT_API_CLIENT_CERT" ]]; then
  echo "[tls] generating vault api client certificate..."

  EXT_FILE="${OUT_DIR}/vault-api-client.ext"
  CSR_FILE="${OUT_DIR}/vault-api-client.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$VAULT_API_CLIENT_KEY"
  openssl req -new -key "$VAULT_API_CLIENT_KEY" -out "$CSR_FILE" -subj "/CN=law-eye-api"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$VAULT_API_CLIENT_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

  rm -f "$CSR_FILE" "$EXT_FILE"
fi

if [[ ! -f "$VAULT_WORKER_CLIENT_KEY" || ! -f "$VAULT_WORKER_CLIENT_CERT" ]]; then
  echo "[tls] generating vault worker client certificate..."

  EXT_FILE="${OUT_DIR}/vault-worker-client.ext"
  CSR_FILE="${OUT_DIR}/vault-worker-client.csr"

  cat > "$EXT_FILE" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=clientAuth
EOF

  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$VAULT_WORKER_CLIENT_KEY"
  openssl req -new -key "$VAULT_WORKER_CLIENT_KEY" -out "$CSR_FILE" -subj "/CN=law-eye-worker"

  openssl x509 -req -in "$CSR_FILE" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$VAULT_WORKER_CLIENT_CERT" -days 825 -sha256 -extfile "$EXT_FILE"

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
echo "  vault server: $VAULT_SERVER_CERT"
echo "  vault key:    $VAULT_SERVER_KEY"
echo "  vault boot:   $VAULT_BOOTSTRAP_CLIENT_CERT"
echo "  vault bkey:   $VAULT_BOOTSTRAP_CLIENT_KEY"
echo "  vault api:    $VAULT_API_CLIENT_CERT"
echo "  vault akey:   $VAULT_API_CLIENT_KEY"
echo "  vault worker: $VAULT_WORKER_CLIENT_CERT"
echo "  vault wkey:   $VAULT_WORKER_CLIENT_KEY"
