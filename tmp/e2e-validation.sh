#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:3000"
OWNER_ID="DEMO-APP-ADMIN"
OWNER_SESSION="00000000-0000-0000-0000-00000000cafe"
REVIEWER_ID="DEMO-SUPER-ADMIN"
REVIEWER_SESSION="00000000-0000-0000-0000-00000000caff"
CONSUMER_ID="DEMO-EMPLOYEE"
CONSUMER_SESSION="00000000-0000-0000-0000-00000000cafd"

owner_hdr=(-H "x-employee-id: $OWNER_ID" -H "x-session-id: $OWNER_SESSION" -H "Content-Type: application/json")
reviewer_hdr=(-H "x-employee-id: $REVIEWER_ID" -H "x-session-id: $REVIEWER_SESSION" -H "Content-Type: application/json")
consumer_hdr=(-H "x-employee-id: $CONSUMER_ID" -H "x-session-id: $CONSUMER_SESSION" -H "Content-Type: application/json")

log() { echo "==> $*"; }

# 1. 创建应用
log "1. create application"
APP=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications" -d '{
  "name": "E2E Validation App",
  "summary": "End-to-end validation application"
}')
echo "$APP" | jq .
APP_ID=$(echo "$APP" | jq -r .applicationId)

# 2. 初始化 artifact 上传
log "2. init artifact upload"
ARTIFACT_BYTES=$(printf 'PK\x03\x04fake-zip-content-for-e2e')
SIZE_BYTES=${#ARTIFACT_BYTES}
UPLOAD_INIT=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/artifact-uploads" -d "{
  \"fileName\": \"e2e.zip\",
  \"mimeType\": \"application/zip\",
  \"sizeBytes\": $SIZE_BYTES
}")
echo "$UPLOAD_INIT" | jq .
UPLOAD_ID=$(echo "$UPLOAD_INIT" | jq -r .uploadId)

# 3. 上传 artifact raw body
log "3. upload artifact content"
UPLOADED=$(curl -s -H "x-employee-id: $OWNER_ID" -H "x-session-id: $OWNER_SESSION" -H "Content-Type: application/octet-stream" -X PUT --data-binary "$ARTIFACT_BYTES" "$API/internal/applications/$APP_ID/artifact-uploads/$UPLOAD_ID/content")
echo "$UPLOADED" | jq .
ARTIFACT_SHA256=$(echo "$UPLOADED" | jq -r .sha256)

# 4. 完成上传
log "4. complete artifact upload"
COMPLETED=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/artifact-uploads/$UPLOAD_ID/complete" -d '{"signature":""}')
echo "$COMPLETED" | jq .
# 完成后的 objectKey 即为制品 final key，可直接作为资产存储键复用
ASSET_STORAGE_KEY=$(echo "$COMPLETED" | jq -r .objectKey)

# 5. 创建版本
log "5. create version"
VERSION=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/versions" -d "{
  \"version\": \"1.0.0\",
  \"changelog\": \"Initial release\",
  \"artifactKey\": \"applications/$APP_ID/artifacts/$UPLOAD_ID\",
  \"artifactSha256\": \"$ARTIFACT_SHA256\",
  \"artifactSignature\": \"\",
  \"scanStatus\": \"passed\"
}")
echo "$VERSION" | jq .
VERSION_ID=$(echo "$VERSION" | jq -r .applicationVersionId)

# 6. 配置全部交付渠道（发布要求 web/desktop/mobile/mini_program 均启用）
log "6. configure delivery channels"
for ch in web desktop mobile mini_program; do
  DELIVERY=$(curl -s "${owner_hdr[@]}" -X PUT "$API/internal/applications/$APP_ID/deliveries/$ch" -d "{
    \"entryUrl\": \"https://example.com/e2e-app/$ch\",
    \"enabled\": true
  }")
  echo "$DELIVERY" | jq -c .
done

# 7. 提交评审
log "7. submit for review"
SUBMITTED=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/versions/$VERSION_ID/submit-review")
echo "$SUBMITTED" | jq .

# 8. 认领评审
log "8. claim review"
CLAIMED=$(curl -s "${reviewer_hdr[@]}" -X POST "$API/internal/applications/versions/$VERSION_ID/claim-review")
echo "$CLAIMED" | jq .

# 9. 评审通过
log "9. approve review"
REVIEWED=$(curl -s "${reviewer_hdr[@]}" -X POST "$API/internal/applications/versions/$VERSION_ID/review" -d '{
  "decision": "approve",
  "comment": "LGTM"
}')
echo "$REVIEWED" | jq .

# 10. 发布
log "10. publish application"
PUBLISHED=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/publish" -d "{\"applicationVersionId\": \"$VERSION_ID\"}")
echo "$PUBLISHED" | jq .

# 11. 目录交付解析（web 渠道）
log "11. resolve delivery (web)"
RESOLVED=$(curl -s "${consumer_hdr[@]}" -X POST "$API/internal/catalog/$APP_ID/deliveries/web/resolve")
echo "$RESOLVED" | jq .

# 12. 资产关联 + 扫描置通过 + 二进制 /asset 流式下载（端到端打通）
log "12a. create asset (reuse uploaded final key)"
ASSET=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/assets" -d "{
  \"assetType\": \"attachment\",
  \"name\": \"e2e-package\",
  \"storageKey\": \"$ASSET_STORAGE_KEY\",
  \"mimeType\": \"application/zip\",
  \"sizeBytes\": $SIZE_BYTES,
  \"sha256\": \"$ARTIFACT_SHA256\"
}")
echo "$ASSET" | jq .
ASSET_ID=$(echo "$ASSET" | jq -r .assetId)

log "12b. scan asset -> passed"
SCANNED=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/assets/$ASSET_ID/scan")
echo "$SCANNED" | jq .
SCAN_STATUS=$(echo "$SCANNED" | jq -r .scanStatus)

log "12c. link asset to desktop delivery"
LINKED=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/deliveries/desktop/assets" -d "{\"assetId\": \"$ASSET_ID\"}")
echo "$LINKED" | jq .

log "12d. resolve delivery (desktop) -> expect download"
RESOLVED_DESKTOP=$(curl -s "${consumer_hdr[@]}" -X POST "$API/internal/catalog/$APP_ID/deliveries/desktop/resolve")
echo "$RESOLVED_DESKTOP" | jq .
DL_URL=$(echo "$RESOLVED_DESKTOP" | jq -r 'if .kind == "download" then .url else "" end')

if [ -z "$DL_URL" ]; then
  echo "ERROR: desktop resolve did not return a download url" >&2
  exit 1
fi

log "12e. download asset bytes and verify integrity"
DL_OUT="tmp/e2e-download.bin"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "${consumer_hdr[@]}" "$API$DL_URL" -o "$DL_OUT"
echo "saved to $DL_OUT, size bytes = $(wc -c < "$DL_OUT" 2>/dev/null || echo unknown)"
DL_SHA256=$(sha256sum "$DL_OUT" | awk '{print $1}')
echo "downloaded bytes sha256 = $DL_SHA256"
echo "expected  bytes sha256 = $ARTIFACT_SHA256"
if [ "$DL_SHA256" = "$ARTIFACT_SHA256" ]; then
  echo "INTEGRITY OK: downloaded bytes match uploaded artifact"
else
  echo "ERROR: downloaded bytes mismatch" >&2
  exit 1
fi

# 13. 创建评论
log "13. create comment"
COMMENT=$(curl -s "${consumer_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/interactions/comments" -d '{
  "body": "Great app!",
  "rating": 5
}')
echo "$COMMENT" | jq .
COMMENT_ID=$(echo "$COMMENT" | jq -r .commentId)

# 14. 官方回复评论
log "14. official reply comment"
REPLY=$(curl -s "${owner_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/interactions/comments" -d "{
  \"body\": \"Thank you!\",
  \"parentCommentId\": \"$COMMENT_ID\"
}")
echo "$REPLY" | jq .

# 15. 创建反馈
log "15. create feedback"
FEEDBACK=$(curl -s "${consumer_hdr[@]}" -X POST "$API/internal/applications/$APP_ID/interactions/feedback" -d '{
  "type": "suggestion",
  "body": "Please add dark mode."
}')
echo "$FEEDBACK" | jq .

log "E2E validation completed."
