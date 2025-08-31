#!/usr/bin/bash -e

# Enable debug logging
set -x

# Make curl request to authenticate
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:9000/auth/user/emailpass \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@medusa-test.com","password":"supersecret"}')
echo "Response: $RESPONSE"

# Extract JSON body (remove status code)
JSON_BODY=$(echo "$RESPONSE" | sed '$d')

# Extract JWT token from response
TOKEN=$(echo "$JSON_BODY" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
  echo "Error: No token found in response"
  exit 1
fi

echo "Token: $TOKEN"

# Store token in GITHUB_OUTPUT if available
if [ -n "$GITHUB_OUTPUT" ]; then
  echo "JWT_TOKEN=$TOKEN" >> "$GITHUB_OUTPUT"
fi

# Get regions
REGION_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:9000/admin/regions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")
echo "Region Response: $REGION_RESPONSE"

REGION_JSON_BODY=$(echo "$REGION_RESPONSE" | sed '$d')

# Extract region ID from response
REGION_ID=$(echo "$REGION_JSON_BODY" | jq -r '.regions[0].id // empty')
if [ -z "$REGION_ID" ]; then
  echo "Error: No region ID found in response"
  exit 1
fi
echo "Region ID: $REGION_ID"

# Get publishable API key
PUB_KEY_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET http://localhost:9000/admin/api-keys?type=publishable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")
echo "Publishable API Key Response: $PUB_KEY_RESPONSE"

# Extract JSON body for API key
PUB_KEY_JSON_BODY=$(echo "$PUB_KEY_RESPONSE" | sed '$d')

# Extract publishable API key from response
PUB_KEY=$(echo "$PUB_KEY_JSON_BODY" | jq -r '.api_keys[0].token // empty')
if [ -z "$PUB_KEY" ]; then
  echo "Error: No publishable API key found in response"
  exit 1
fi
echo "Publishable API Key: $PUB_KEY"

# Store region ID and publishable API key in GITHUB_OUTPUT if available
if [ -n "$GITHUB_OUTPUT" ]; then
  echo "REGION_ID=$REGION_ID" >> "$GITHUB_OUTPUT"
  echo "PUB_KEY=$PUB_KEY" >> "$GITHUB_OUTPUT"
fi