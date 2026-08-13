#!/usr/bin/env bash
set +e
API="http://localhost:3000"
H1="x-employee-id: DEMO-APP-ADMIN"
H2="x-session-id: 00000000-0000-0000-0000-00000000cafe"

APP=$(curl -s -H "$H1" -H "$H2" -H "Content-Type: application/json" -X POST "$API/internal/applications" -d '{"name":"Repro3","summary":"repro3"}')
echo "APP=$APP"
APP_ID=$(echo "$APP" | jq -r .applicationId)
echo "APP_ID=$APP_ID"

UP=$(curl -s -H "$H1" -H "$H2" -H "Content-Type: application/json" -X POST "$API/internal/applications/$APP_ID/artifact-uploads" -d '{"fileName":"e2e.zip","mimeType":"application/zip","sizeBytes":28}')
echo "UP=$UP"
UP_ID=$(echo "$UP" | jq -r .uploadId)
echo "UP_ID=$UP_ID"

printf 'PK\x03\x04fake-zip-content-for-e2e' > tmp/repro-body.bin
echo "=== PUT raw content (response + headers) ==="
curl -s -i -H "$H1" -H "$H2" -H "Content-Type: application/octet-stream" -X PUT --data-binary @tmp/repro-body.bin "$API/internal/applications/$APP_ID/artifact-uploads/$UP_ID/content"
echo
echo "=== end ==="
