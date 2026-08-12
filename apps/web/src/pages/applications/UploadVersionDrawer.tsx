import {
  Button,
  Drawer,
  Form,
  Input,
  Progress,
  Space,
  Upload,
  message,
} from "antd";
import { useState } from "react";
import type { UploadFile } from "antd/es/upload/interface";

import {
  uploadArtifactContent,
  type ArtifactUploadRecord,
} from "../../modules/application/application.client";
import {
  useArtifactUpload,
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
  const [form] = Form.useForm<VersionFormValues>();

  const reset = () => {
    setFileList([]);
    setUploadRecord(null);
    setProgress(0);
    setUploading(false);
    setCreating(false);
    form.resetFields();
  };

  const handleUpload = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning("请先选择安装包文件");
      return;
    }
    setUploading(true);
    try {
      const session = await upload.start.mutateAsync({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      const content = await file.arrayBuffer();
      await uploadArtifactContent(
        applicationId,
        session.uploadId,
        content,
        setProgress,
      );
      const completed = await upload.complete.mutateAsync({
        uploadId: session.uploadId,
        signature: "",
      });
      setUploadRecord(completed);
      message.success("上传完成，扫描校验通过");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (uploadRecord === null) return;
    const values = await form.validateFields();
    if (uploadRecord.sha256 === null) return;
    setCreating(true);
    try {
      await createVersion.mutateAsync({
        version: values.version.trim(),
        changelog: values.changelog.trim(),
        artifactKey: uploadRecord.objectKey,
        artifactSha256: uploadRecord.sha256,
        artifactSignature: "",
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
      destroyOnClose
      onClose={() => {
        reset();
        onClose();
      }}
      open={open}
      title="上传新版本"
      width={480}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Upload
          beforeUpload={() => false}
          fileList={fileList}
          maxCount={1}
          onChange={({ fileList: next }) => setFileList(next)}
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
            <div>
              扫描状态：
              {uploadRecord.scanStatus === "passed"
                ? "已通过"
                : uploadRecord.scanStatus}
            </div>
          </div>
        ) : null}

        {uploadRecord?.scanStatus === "passed" ? (
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
            <Button
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
