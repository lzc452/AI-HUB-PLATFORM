import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Space, Table, Typography, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

import { showErrorMessage, showSuccessMessage } from "../../../../shared/ui/message";

interface ImportPreview<T> {
  rows: T[];
  summary: {
    total: number;
    create: number;
    update: number;
    invalid: number;
  };
  errors: string[];
}

interface CsvImportModalProps<T extends object> {
  columns: ColumnsType<T>;
  confirmText?: string;
  open: boolean;
  preview: (file: File) => Promise<ImportPreview<T>>;
  rowKey: string;
  submit: (rows: T[]) => Promise<unknown>;
  title: string;
  onClose: () => void;
}

/** 两段式 CSV 导入弹窗：先上传解析预览，人工确认后再提交入库。 */
export function CsvImportModal<T extends object>({
  columns,
  confirmText = "确认导入",
  open,
  preview,
  rowKey,
  submit,
  title,
  onClose,
}: CsvImportModalProps<T>) {
  const [previewData, setPreviewData] = useState<ImportPreview<T> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPreviewData(null);
    setParsing(false);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setPreviewData(null);
    try {
      const result = await preview(file);
      setPreviewData(result);
    } catch (error) {
      showErrorMessage(error, "解析 CSV 失败");
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (previewData === null) return;
    setSubmitting(true);
    try {
      await submit(previewData.rows);
      showSuccessMessage("导入成功");
      handleClose();
    } catch (error) {
      showErrorMessage(error, "导入失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      confirmLoading={submitting}
      footer={[
        <Button key="close" onClick={handleClose}>
          取消
        </Button>,
        <Button
          disabled={previewData === null || previewData.rows.length === 0}
          key="submit"
          loading={submitting}
          onClick={handleSubmit}
          type="primary"
        >
          {confirmText}
        </Button>,
      ]}
      onCancel={handleClose}
      open={open}
      title={title}
      width={900}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Upload
          accept=".csv,text/csv"
          beforeUpload={(file) => {
            void handleFile(file);
            return false;
          }}
          maxCount={1}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />} loading={parsing}>
            选择 CSV 文件
          </Button>
        </Upload>

        {previewData !== null ? (
          <>
            <Typography.Text type="secondary">
              共 {previewData.summary.total} 条，新增 {previewData.summary.create}{" "}
              条，更新 {previewData.summary.update} 条，无效{" "}
              {previewData.summary.invalid} 条
            </Typography.Text>
            {previewData.errors.length > 0 ? (
              <Alert
                description={previewData.errors.slice(0, 10).join("；")}
                showIcon
                type="warning"
              />
            ) : null}
            <Table<T>
              columns={columns}
              dataSource={previewData.rows}
              pagination={false}
              rowKey={rowKey}
              scroll={{ x: "max-content" }}
              size="small"
            />
          </>
        ) : null}
      </Space>
    </Modal>
  );
}
