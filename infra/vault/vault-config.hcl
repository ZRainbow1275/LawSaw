ui = true

disable_mlock = true

storage "file" {
  path = "/vault/file"
}

listener "tcp" {
  address = "0.0.0.0:8200"

  tls_cert_file = "/vault/tls/vault.crt"
  tls_key_file  = "/vault/tls/vault.key"

  # Require clients to present a certificate signed by our local CA.
  tls_client_ca_file                 = "/vault/tls/ca.crt"
  tls_require_and_verify_client_cert = true
}

api_addr = "https://vault:8200"

