import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Progress,
  Space,
  Upload,
  message,
} from "antd";
import { useEffect, useState } from "react";
import type { UploadFile } from "antd/es/upload/interface";

import {
  uploadArtifactContent,
  type ArtifactUploadRecord,
} from "../../modules/application/application.client";
import { getArtifactUploadErrorMessage } from "../../modules/application/application.errors";
import {
  useArtifactUpload,
  useArtifactUploadStatus,
  useCreateVersion,
} from "../../modules/application/useApplication";

interface UploadVersionDrawerProps {
  applicationId: string;
  open: boolean;
  onClose: () => void;
}

interface VersionFormValues {
  version: string;
  changelog: string;
}

/** 上传 artifact → 完成校验 → 创建版本 的完整流程抽屉。 */
export function UploadVersionDrawer({
  applicationId,
  onClose,
  open,
}: UploadVersionDrawerProps) {
  const upload = useArtifactUpload(applicationId);
  const createVersion = useCreateVersion(applicationId);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadRecord, setUploadRecord] = useState<ArtifactUploadRecord | null>(
    null,
  );
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  // 未签名制品（signed=false）必须由提交人显式确认风险（规格 §5.5）。
  const [acceptUnsigned, setAcceptUnsigned] = useState(false);
  const [form] = Form.useForm<VersionFormValues>();
  const busy = uploading || creating;
  const statusUploadId =
    uploadRecord !== null &&
    (uploadRecord.uploadStatus === "verifying" ||
      uploadRecord.scanStatus === "pending")
      ? uploadRecord.uploadId
      : undefined;
  const uploadStatus = useArtifactUploadStatus(applicationId, statusUploadId);

  useEffect(() => {
    const next = uploadStatus.data;
    if (next === undefined || next.uploadId !== uploadRecord?.uploadId) {
      return;
    }
    setUploadRecord(next);
    if (next.uploadStatus === "failed" || next.scanStatus === "failed") {
      setProcessError(
        `扫描失败：${getArtifactUploadErrorMessage(next.errorCode)}`,
      );
      return;
    }
    if (isVerifiedUpload(next)) {
      setProcessError(null);
    }
  }, [uploadRecord?.uploadId, uploadStatus.data]);

  const reset = () => {
    setFileList([]);
    setUploadRecord(null);
    setProgress(0);
    setUploading(false);
    setCreating(false);
    setProcessError(null);
    setAcceptUnsigned(false);
    form.resetFields();
  };

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning("请先选择安装包文件");
      return;
    }
    setUploading(true);
    setProgress(0);
    setProcessError(null);
    try {
      const session = await upload.start.mutateAsync({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await uploadArtifactContent(
        applicationId,
        session.uploadId,
        file,
        setProgress,
      );
      const completed = await upload.complete.mutateAsync({
        uploadId: session.uploadId,
        signature: "",
      });
      setUploadRecord(completed);
      if (
        completed.uploadStatus === "completed" &&
        completed.scanStatus === "passed" &&
        completed.sha256 !== null
      ) {
        message.success("上传完成，扫描校验通过");
      } else if (
        completed.uploadStatus === "failed" ||
        completed.scanStatus === "failed"
      ) {
        setProcessError(
          `扫描失败：${getArtifactUploadErrorMessage(completed.errorCode)}`,
        );
      } else {
        setProcessError("制品上传或扫描尚未完成，请稍后重试");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "上传失败";
      setProcessError(detail);
      message.error(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!isVerifiedUpload(uploadRecord)) return;
    let values: VersionFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setCreating(true);
    try {
      await createVersion.mutateAsync({
        version: values.version.trim(),
        changelog: values.changelog.trim(),
        artifactKey: uploadRecord.objectKey,
        artifactSha256: uploadRecord.sha256,
        artifactSignature: uploadRecord.signature ?? "",
        ...(uploadRecord.signed === false ? { acceptUnsigned: true } : {}),
      });
      reset();
      onClose();
    } catch {
      // 错误提示由 hook 统一处理
    } finally {
      setCreating(false);
    }
  };

  return (
    <Drawer
      closable={!busy}
      destroyOnClose
      keyboard={!busy}
      maskClosable={!busy}
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
      open={open}
      size={480}
      title="上传新版本"
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Upload
          beforeUpload={() => false}
          disabled={uploading || creating}
          fileList={fileList}
          maxCount={1}
          onChange={({ fileList: next }) => {
            setFileList(next);
            setUploadRecord(null);
            setProgress(0);
            setProcessError(null);
          }}
        >
          <Button disabled={uploading} icon={<span>⬆</span>}>
            选择安装包
          </Button>
        </Upload>

        {fileList.length > 0 && !uploadRecord ? (
          <>
            <Button
              loading={uploading}
              onClick={() => void handleUpload()}
              type="primary"
            >
              开始上传
            </Button>
            {uploading ? <Progress percent={progress} status="active" /> : null}
          </>
        ) : null}

        {uploadRecord ? (
          <div className="space-y-2 rounded-lg border border-[#e4eaf2] bg-[#f8fafc] p-3 text-sm text-[#374151]">
            <div>
              文件名：<strong>{uploadRecord.fileName}</strong>
            </div>
            <div>
              大小：{(uploadRecord.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </div>
            <div className="break-all">
              SHA-256：<code>{uploadRecord.sha256 ?? "-"}</code>
            </div>
            <div>上传状态：{uploadRecord.uploadStatus}</div>
            <div>
              扫描状态：
              {uploadRecord.scanStatus === "passed"
                ? "已通过"
                : uploadRecord.scanStatus}
            </div>
          </div>
        ) : null}

        {processError ? (
          <Alert showIcon title={processError} type="error" />
        ) : null}

        {isVerifiedUpload(uploadRecord) ? (
          <Form form={form} layout="vertical" name="create-version">
            <Form.Item
              label="版本号"
              name="version"
              rules={[{ required: true, message: "请输入版本号" }]}
            >
              <Input placeholder="例如：1.0.0" />
            </Form.Item>
            <Form.Item
              label="变更说明"
              name="changelog"
              rules={[{ required: true, message: "请输入变更说明" }]}
            >
              <Input.TextArea placeholder="描述本次版本的变更内容" rows={3} />
            </Form.Item>
            {uploadRecord.signed === false ? (
              <>
                <Alert
                  showIcon
                  type="warning"
                  title="该制品未签名"
                  description="制品未经数字签名校验，审核时将显著标记该风险。请确认来源可信后再创建版本。"
                />
                <Checkbox
                  checked={acceptUnsigned}
                  onChange={(event) => setAcceptUnsigned(event.target.checked)}
                >
                  我已知晓制品未签名并接受风险
                </Checkbox>
              </>
            ) : null}
            <Button
              disabled={
                !isVerifiedUpload(uploadRecord) ||
                (uploadRecord.signed === false && !acceptUnsigned)
              }
              loading={creating}
              onClick={() => void handleCreateVersion()}
              type="primary"
            >
              创建版本
            </Button>
          </Form>
        ) : null}
      </Space>
    </Drawer>
  );
}

function isVerifiedUpload(
  upload: ArtifactUploadRecord | null,
): upload is ArtifactUploadRecord & { sha256: string } {
  return (
    upload !== null &&
    upload.uploadStatus === "completed" &&
    upload.scanStatus === "passed" &&
    upload.sha256 !== null
  );
}
