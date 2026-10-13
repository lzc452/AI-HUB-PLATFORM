import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import { Modal, Radio, Typography, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { getAssetContent, useAssetImage } from "../application";
import { deleteAsset } from "./publishing.client";
import { useObjectUrlRegistry } from "./useObjectUrlRegistry";
import type { WizardUploadFn } from "./upload-types";

const { Text } = Typography;

export function IconField({
  applicationId,
  upload,
}: {
  applicationId: string;
  upload: WizardUploadFn;
}) {
  const { control, watch, setValue, trigger } = useFormContext<FieldValues>();
  const mode = watch("icon.mode");
  const name = watch("name");
  const bg = watch("icon.backgroundColor");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const { track, release } = useObjectUrlRegistry();
  const watchedAssetId = watch("icon.assetId");
  const { objectUrl: assetImageUrl } = useAssetImage(
    applicationId,
    typeof watchedAssetId === "string" && watchedAssetId.length > 0
      ? watchedAssetId
      : undefined,
  );

  // 首字母预览自动取自应用名称，无需重新输入。
  const letter =
    typeof name === "string" && name.trim().length > 0
      ? name.trim().slice(0, 1)
      : "A";

  return (
    <Controller
      control={control}
      name="icon.mode"
      render={({ field, fieldState }) => (
        <div>
          <Radio.Group
            {...field}
            onChange={(event) => {
              field.onChange(event);
              void trigger(["icon.mode", "icon.assetId"]);
            }}
            optionType="button"
            options={[
              { value: "upload", label: "上传图标图片" },
              { value: "auto", label: "自动生成（首字母预览）" },
            ]}
            style={{ marginBottom: 12 }}
          />
          {fieldState.error !== undefined && (
            <div style={{ color: "#ff4d4f", fontSize: 12, marginBottom: 8 }}>
              {fieldState.error.message}
            </div>
          )}
          {/* 预览 / 上传组件统一放在选择器下方，而非右侧。 */}
          <div style={{ marginTop: 4 }}>
            {mode === "auto" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: bg ?? "#185FA5",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  {letter}
                </div>
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                  预览取自应用名称首字
                </span>
              </div>
            ) : (
              <Controller
                control={control}
                name="icon.assetId"
                render={({ field: assetField }) => (
                  <Upload
                    maxCount={1}
                    listType="picture-card"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      const uid = `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`;
                      // 替换图标时释放上一张的objectURL，避免反复换图累积泄漏。
                      release(iconUrl);
                      setIconUrl(track(URL.createObjectURL(file as File)));
                      setValue("icon.assetId", uid, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      void upload("icon", file as File)
                        .then((asset) => {
                          setValue("icon.assetId", asset.assetId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          void trigger(["icon.mode", "icon.assetId"]);
                        })
                        .catch((error: unknown) => {
                          setValue("icon.assetId", "", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          void trigger(["icon.mode", "icon.assetId"]);
                          message.error(
                            `图标上传失败：${
                              error instanceof Error
                                ? error.message
                                : "上传服务或存储配置异常"
                            }`,
                          );
                        });
                      return false;
                    }}
                  >
                    {assetField.value ? (
                      <img
                        src={iconUrl ?? assetImageUrl ?? ""}
                        alt="应用图标"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <div>
                        <UploadOutlined />
                        <div style={{ marginTop: 8 }}>上传图标</div>
                      </div>
                    )}
                  </Upload>
                )}
              />
            )}
          </div>
        </div>
      )}
    />
  );
}

interface ScreenshotFile {
  uid: string;
  assetId: string;
  url: string;
  name: string;
}

export function ScreenshotField({
  applicationId,
  upload,
}: {
  applicationId: string;
  upload: WizardUploadFn;
}) {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const watchedScreenshotIds = useWatch({
    control,
    name: "screenshotAssetIds",
  }) as string[] | undefined;
  const watchedScreenshotKey = Array.isArray(watchedScreenshotIds)
    ? watchedScreenshotIds.join(",")
    : "";
  // 本地保存已上传图片的预览地址，保证步骤间切换（组件常驻挂载）后缩略图不丢失。
  const filesRef = useRef<ScreenshotFile[]>([]);
  const [files, setFiles] = useState<ScreenshotFile[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );
  const { track, releaseMany } = useObjectUrlRegistry();

  // 统一收敛点：任何列表变更都经由 syncFiles，因此在这里精确释放
  // 「不再存在于新列表中」的 objectURL —— 保留仍在展示的预览图，
  // 避免「整表清空式 revoke」导致可见图片变空白。
  const syncFiles = (next: ScreenshotFile[]) => {
    const nextUrls = new Set(next.map((file) => file.url));
    for (const previous of filesRef.current) {
      if (!nextUrls.has(previous.url)) releaseMany([previous.url]);
    }
    filesRef.current = next;
    setFiles(next);
  };

  // 编辑模式回显：草稿中的截图资产拉取图片并生成预览。
  useEffect(() => {
    if (!applicationId || !Array.isArray(watchedScreenshotIds)) {
      return;
    }
    const existing = new Set(filesRef.current.map((file) => file.assetId));
    const missing = watchedScreenshotIds.filter(
      (assetId) =>
        typeof assetId === "string" &&
        assetId.length > 0 &&
        !existing.has(assetId),
    );
    if (missing.length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      missing.map(async (assetId) => {
        const blob = await getAssetContent(applicationId, assetId);
        return {
          assetId,
          name: "历史截图",
          uid: assetId,
          url: URL.createObjectURL(blob),
        };
      }),
    )
      .then((added) => {
        if (cancelled) return;
        syncFiles([...filesRef.current, ...added].slice(0, 6));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applicationId, watchedScreenshotKey]);

  return (
    <Controller
      control={control}
      name="screenshotAssetIds"
      render={({ fieldState }) => {
        const commit = (next: ScreenshotFile[]) => {
          syncFiles(next);
          setValue(
            "screenshotAssetIds",
            next.map((f) => f.assetId),
            { shouldDirty: true, shouldValidate: true },
          );
          void trigger("screenshotAssetIds");
        };
        const handleUpload = (file: File) => {
          const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const url = track(URL.createObjectURL(file));
          const optimistic = [
            ...filesRef.current,
            { uid, assetId: uid, url, name: file.name },
          ].slice(0, 6);
          commit(optimistic);
          void upload("screenshot", file)
            .then((asset) => {
              commit(
                filesRef.current.map((p) =>
                  p.uid === uid ? { ...p, assetId: asset.assetId } : p,
                ),
              );
            })
            .catch((error: unknown) => {
              // 回滚：释放刚创建的预览地址（此刻列表中已不再保留该文件）。
              // 随后 commit → syncFiles 会再尝试释放同一 url，但 release 内部
              // 以 Set 去重，第二次是空操作，不会重复 revoke。
              const stale = filesRef.current.find((item) => item.uid === uid);
              releaseMany(stale ? [stale.url] : []);
              commit(filesRef.current.filter((p) => p.uid !== uid));
              message.error(
                `截图上传失败：${
                  error instanceof Error
                    ? error.message
                    : "上传服务或存储配置异常"
                }`,
              );
            });
        };
        const handleRemove = (uid: string) => {
          const target = filesRef.current.find((f) => f.uid === uid);
          commit(filesRef.current.filter((f) => f.uid !== uid));
          // 同步删除服务端资产（失败仅忽略，前端已移除）。
          if (target && target.assetId) {
            void deleteAsset(applicationId, target.assetId).catch(() => {});
          }
        };

        const fileList: UploadFile[] = files.map((f) => ({
          uid: f.uid,
          name: f.name,
          status: "done",
          url: f.url,
          thumbUrl: f.url,
        }));
        const showUpload = files.length < 6;

        return (
          <>
            <Upload
              multiple
              maxCount={6}
              listType="picture-card"
              fileList={fileList}
              beforeUpload={(file) => {
                handleUpload(file as File);
                return false;
              }}
              onRemove={(file) => {
                handleRemove(file.uid);
                return true;
              }}
              onPreview={(file) =>
                setPreview({ url: file.url ?? "", name: file.name })
              }
            >
              {showUpload ? (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传截图</div>
                </div>
              ) : null}
            </Upload>
            <Text type="secondary" style={{ display: "block" }}>
              已上传 {files.length}/6 张（点击图片可预览，右上角可删除）
            </Text>
            {fieldState.error !== undefined && (
              <Text type="danger">{fieldState.error.message}</Text>
            )}
            <Modal
              open={preview !== null}
              footer={null}
              title={preview?.name}
              onCancel={() => setPreview(null)}
            >
              {preview ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  style={{ width: "100%", borderRadius: 8 }}
                />
              ) : null}
            </Modal>
          </>
        );
      }}
    />
  );
}
