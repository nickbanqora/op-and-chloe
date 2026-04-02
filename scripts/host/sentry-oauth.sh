#!/usr/bin/env bash
# One-time Sentry OAuth2 flow to obtain refresh token for token-vending.
#
# Usage:
#   ./scripts/host/sentry-oauth.sh <client_id> <client_secret>
#
# 1. Opens browser to Sentry authorization page
# 2. Starts a temporary local server to catch the callback
# 3. Exchanges auth code for tokens
# 4. Writes refresh token to /etc/token-vending/sentry-refresh-token
#
# Prerequisites: python3, curl, jq
set -euo pipefail

CLIENT_ID="${1:?Usage: $0 <client_id> <client_secret>}"
CLIENT_SECRET="${2:?Usage: $0 <client_id> <client_secret>}"
REDIRECT_PORT=3000
REDIRECT_URI="http://localhost:${REDIRECT_PORT}/callback"
TV_DIR="${TOKEN_VENDING_SECRETS_DIR:-/etc/token-vending}"

echo "=== Sentry OAuth2 Setup ==="
echo "Client ID: $CLIENT_ID"
echo "Redirect:  $REDIRECT_URI"
echo

# Build authorization URL
AUTH_URL="https://sentry.io/oauth/authorize/?client_id=${CLIENT_ID}&response_type=code&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$REDIRECT_URI'))")"

echo "Open this URL in your browser:"
echo
echo "  $AUTH_URL"
echo
echo "Waiting for callback on port $REDIRECT_PORT..."

# Start a one-shot HTTP server to capture the callback
AUTH_CODE=$(python3 -c "
import http.server, urllib.parse, sys

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        code = params.get('code', [None])[0]
        if code:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'<h1>Success!</h1><p>You can close this tab.</p>')
            print(code, flush=True)
        else:
            self.send_response(400)
            self.end_headers()
            error = params.get('error', ['unknown'])[0]
            self.wfile.write(f'<h1>Error: {error}</h1>'.encode())
            print('ERROR:' + error, flush=True)
        # Shutdown after first request
        import threading
        threading.Thread(target=self.server.shutdown).start()
    def log_message(self, *args):
        pass

server = http.server.HTTPServer(('127.0.0.1', $REDIRECT_PORT), Handler)
server.handle_request()
server.server_close()
" 2>/dev/null)

if [[ "$AUTH_CODE" == ERROR:* ]]; then
  echo "Authorization failed: ${AUTH_CODE#ERROR:}"
  exit 1
fi

if [ -z "$AUTH_CODE" ]; then
  echo "No authorization code received"
  exit 1
fi

echo "Got auth code: ${AUTH_CODE:0:10}..."
echo "Exchanging for tokens..."

# Exchange auth code for tokens
RESPONSE=$(curl -sf "https://sentry.io/api/0/sentry-app-installations/" \
  -d grant_type=authorization_code \
  -d code="$AUTH_CODE" \
  -d client_id="$CLIENT_ID" \
  -d client_secret="$CLIENT_SECRET" \
  -d redirect_uri="$REDIRECT_URI" 2>&1) || {
  # Try the standard OAuth endpoint instead
  RESPONSE=$(curl -sf "https://sentry.io/oauth/token/" \
    -d grant_type=authorization_code \
    -d code="$AUTH_CODE" \
    -d client_id="$CLIENT_ID" \
    -d client_secret="$CLIENT_SECRET" \
    -d redirect_uri="$REDIRECT_URI" 2>&1)
}

ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')
EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expires_in // empty')
SCOPE=$(echo "$RESPONSE" | jq -r '.scope // empty')

if [ -z "$ACCESS_TOKEN" ] || [ -z "$REFRESH_TOKEN" ]; then
  echo "Token exchange failed:"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo
echo "=== Success ==="
echo "Access token:  ${ACCESS_TOKEN:0:15}..."
echo "Refresh token: ${REFRESH_TOKEN:0:15}..."
echo "Expires in:    ${EXPIRES_IN}s"
echo "Scope:         $SCOPE"

# Write secrets
mkdir -p "$TV_DIR"
printf '%s' "$CLIENT_SECRET" > "$TV_DIR/sentry-client-secret"
printf '%s' "$REFRESH_TOKEN" > "$TV_DIR/sentry-refresh-token"
chown root:1500 "$TV_DIR/sentry-client-secret" "$TV_DIR/sentry-refresh-token" 2>/dev/null || true
chmod 640 "$TV_DIR/sentry-client-secret" "$TV_DIR/sentry-refresh-token" 2>/dev/null || true

echo
echo "Written to $TV_DIR:"
echo "  sentry-client-secret"
echo "  sentry-refresh-token"
echo
echo "Add this to $TV_DIR/config.yaml:"
echo
echo "sentry:"
echo "  client_id: \"$CLIENT_ID\""
echo "  client_secret_file: sentry-client-secret"
echo "  refresh_token_file: sentry-refresh-token"
echo
echo "Then restart token-vending: docker restart op-and-chloe-token-vending"
