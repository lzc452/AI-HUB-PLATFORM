import { Button, Input, Spin, Tag, Typography } from "antd";
import type { DeliveryChannel } from "@ai-hub/contracts";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { useApplicationDeliveries } from "../../modules/application/useApplication";
import { MessageError, showSuccessMessage, showWarningMessage } from "../../shared/ui/message";

const { Text } = Typography;

const channels: Array<{ channel: DeliveryChannel; label: string; icon: string }> = [
  { channel: "web", label: "Web 应用", icon: "app-ui-icon-web" },
  { channel: "desktop", label: "桌面端", icon: "app-ui-icon-desktop" },
  { channel: "mobile", label: "移动端", icon: "app-ui-icon-mobile" },
  { channel: "mini_program", label: "小程序", icon: "app-ui-icon-mini" },
];

export default function ApplicationDeliveryPage() {
  const { applicationId } = useParams();
  const deliveriesQuery = useApplicationDeliveries(applicationId);
  const [activeChannel, setActiveChannel] = useState<DeliveryChannel>("web");
  const [webUrl, setWebUrl] = useState("https://ocr.company.com");
  const deliveryMap = useMemo(() => new Map((deliveriesQuery.data ?? []).map((item) => [item.channel, item])), [deliveriesQuery.data]);
  const activeDelivery = deliveryMap.get(activeChannel);

  return (
    <ApplicationAdminPage description="配置 Web、桌面端、移动端和小程序的交付入口。" showNavigation={false} title="交付配置">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(310px,1fr)]">
        <main className="space-y-3">
          <section className="app-admin-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-3">
              <div className="text-[14px] font-semibold text-[#1f2937]">应用类型 <span className="font-normal text-[#8a94a6]">（交付渠道）</span></div>
              <div className="text-[13px] text-[#596579]">已启用交付渠道：<strong className="text-[#1f2937]">{deliveriesQuery.data?.filter((item) => item.enabled).length || 4}</strong></div>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-3">
              {channels.map((item) => <Button className={activeChannel === item.channel ? "!border-[#5796ff] !bg-[#f0f7ff] !text-[#1677ff]" : ""} key={item.channel} onClick={() => setActiveChannel(item.channel)}><i aria-hidden="true" className={`app-ui-icon ${item.icon} mr-2`} />{item.label}</Button>)}
            </div>
          </section>

          {activeChannel === "web" ? <WebDeliveryCard value={webUrl} onChange={setWebUrl} configured={activeDelivery?.enabled ?? true} /> : null}
          {activeChannel === "desktop" ? <DesktopDeliveryCard /> : null}
          {activeChannel === "mobile" ? <MobileDeliveryCard /> : null}
          {activeChannel === "mini_program" ? <MiniProgramCard /> : null}
          <div className="flex justify-end gap-2 rounded-lg border border-[#e2e8f0] bg-white px-5 py-3"><Button onClick={() => showSuccessMessage("交付配置草稿已保存")}>保存草稿</Button><Button type="primary" onClick={() => showWarningMessage("提交审核前请完成全部交付渠道校验")}>提交审核</Button></div>
        </main>

        <aside className="space-y-3">
          <SideCard title="自动校验规则">
            {[['扩展名', '仅允许白名单扩展名'], ['文件类型', '校验 MIME 类型一致性'], ['大小限制', '不超过上传限制配置'], ['签名校验', '验证数字签名有效性'], ['二维码解析', '验证二维码可识别']].map(([label, value]) => <div className="flex items-center gap-3 text-[13px]" key={label}><i aria-hidden="true" className="app-ui-icon app-ui-icon-check text-[#20b26b]" /><span className="w-[80px] text-[#596579]">{label}</span><span className="text-[#697386]">{value}</span></div>)}
          </SideCard>
          <SideCard title="上传限制">
            {[['图标 / 封面 / 二维码', '5 MB'], ['截图', '10 MB（最多 6 张）'], ['安装包', '2 GB'], ['合计', '5 GB']].map(([label, value]) => <div className="flex justify-between text-[13px]" key={label}><span className="text-[#596579]">{label}</span><strong className="font-medium text-[#374151]">{value}</strong></div>)}
          </SideCard>
          <SideCard title="最近交付记录">
            <div className="relative space-y-4 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[#bfd2f2]">
              {[
                ["保存草稿（Web 应用配置）", "张伟 10 分钟前", "#1677ff"],
                ["上传 Windows 安装包 v2.4.1", "张伟 20 分钟前", "#1677ff"],
                ["保存草稿（移动端应用配置）", "张伟 35 分钟前", "#20b26b"],
              ].map(([label, desc, color]) => (
                <div className="relative" key={label}>
                  <span className="absolute -left-5 top-1 h-3 w-3 rounded-full border-2 border-white" style={{ background: color, boxShadow: `0 0 0 1px ${color}` }} />
                  <div className="text-[13px] text-[#374151]">{label}</div>
                  <div className="text-[12px] text-[#8a94a6]">{desc}</div>
                </div>
              ))}
            </div>
          </SideCard>
        </aside>
      </div>
      {deliveriesQuery.isPending ? <Spin aria-label="交付配置加载中" /> : null}
      <MessageError active={deliveriesQuery.isError} cause={deliveriesQuery.error} title="交付配置加载失败" />
    </ApplicationAdminPage>
  );
}

function WebDeliveryCard({ value, onChange, configured }: { value: string; onChange: (value: string) => void; configured: boolean }) {
  return <section className="app-admin-card overflow-hidden"><h3 className="border-b border-[#edf0f5] px-5 py-3 text-[16px] font-semibold"><i aria-hidden="true" className="app-ui-icon app-ui-icon-web mr-2 text-[#1677ff]" />Web 应用</h3><div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_1fr_150px]"><Field label="企业内网地址"><Input value={value} onChange={(event) => onChange(event.target.value)} suffix={<i aria-hidden="true" className="app-ui-icon app-ui-icon-check text-[#20b26b]" />} /></Field><Field label="回调地址"><Input defaultValue="https://ocr.company.com/callback" suffix={<i aria-hidden="true" className="app-ui-icon app-ui-icon-check text-[#20b26b]" />} /></Field><Field label="可访问网络"><Tag>企业内网</Tag></Field></div><div className="flex items-center gap-2 px-5 pb-4 text-[13px] text-[#20a267]"><i aria-hidden="true" className="app-ui-icon app-ui-icon-check" />域名校验通过 {configured ? "已启用" : "待启用"}</div></section>;
}

function DesktopDeliveryCard() { return <section className="app-admin-card overflow-hidden"><h3 className="border-b border-[#edf0f5] px-5 py-3 text-[16px] font-semibold"><i aria-hidden="true" className="app-ui-icon app-ui-icon-desktop mr-2 text-[#1677ff]" />桌面端应用</h3><div className="grid gap-3 p-4 md:grid-cols-2"><UploadCard title="Windows 安装包（.exe/.msi）" name="OCR 票据识别_2.4.1_x64.exe" size="128.6 MB" icon="app-ui-icon-desktop" /><UploadCard title="macOS 安装包（.dmg/.pkg）" name="OCR 票据识别_2.4.1_arm64.dmg" size="156.3 MB" icon="app-ui-icon-desktop" /></div></section>; }
function MobileDeliveryCard() { return <section className="app-admin-card overflow-hidden"><h3 className="border-b border-[#edf0f5] px-5 py-3 text-[16px] font-semibold"><i aria-hidden="true" className="app-ui-icon app-ui-icon-mobile mr-2 text-[#1677ff]" />移动端应用</h3><div className="grid gap-3 p-4 md:grid-cols-2"><UploadCard title="Android 应用（.apk）" name="ocr_receipt_2.4.1_release.apk" size="54.7 MB" icon="app-ui-icon-mobile" /><div className="rounded-lg border border-[#e4eaf2] p-3"><div className="text-[13px] font-semibold">iOS 应用</div><div className="mt-3 flex items-center gap-3"><Input defaultValue="https://apps.company.com/ocr/ios" suffix={<i aria-hidden="true" className="app-ui-icon app-ui-icon-check text-[#20b26b]" />} /><QrGraphic /></div><div className="mt-2 flex items-center gap-2 text-[12px] text-[#1677ff]"><i aria-hidden="true" className="app-ui-icon app-ui-icon-download" />下载二维码</div></div></div></section>; }
function MiniProgramCard() { return <section className="app-admin-card overflow-hidden"><h3 className="border-b border-[#edf0f5] px-5 py-3 text-[16px] font-semibold"><i aria-hidden="true" className="app-ui-icon app-ui-icon-mini mr-2 text-[#1677ff]" />小程序应用</h3><div className="grid gap-3 p-4 md:grid-cols-3">{[['微信小程序', 'wx1234567890abcdef'], ['钉钉小程序', 'ding1234567890abcdef'], ['支付宝小程序', '2021003124654678']].map(([title, value]) => <div className="rounded-lg border border-[#e4eaf2] p-3" key={title}><div className="flex justify-between text-[13px] font-semibold"><span>{title}</span><span className="text-[#697386]">二维码</span></div><div className="mt-2 flex items-center gap-2"><div className="min-w-0 flex-1"><Text className="text-xs">小程序 ID</Text><Input className="mt-1" defaultValue={value} suffix={<i aria-hidden="true" className="app-ui-icon app-ui-icon-check text-[#20b26b]" />} /></div><QrGraphic /></div></div>)}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[13px] font-medium text-[#374151]"><span className="mb-2 block">{label}</span>{children}</label>; }
function UploadCard({ title, name, size, icon }: { title: string; name: string; size: string; icon: string }) { return <div className="rounded-lg border border-[#e4eaf2] p-3"><div className="text-[13px] font-semibold">{title}</div><div className="mt-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#e9f2ff] text-lg text-[#1677ff]"><i aria-hidden="true" className={`app-ui-icon ${icon}`} /></span><span className="min-w-0 flex-1 truncate text-[13px]">{name}</span><Tag color="success">已上传</Tag></div><div className="mt-2 text-[12px] text-[#8a94a6]">版本号：v2.4.1 / 大小：{size} / 更新时间：2024-05-01 10:20</div></div>; }
function QrGraphic() { return <span className="qr-graphic" aria-label="二维码"><span className="qr-pattern" /></span>; }
function SideCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="app-admin-card overflow-hidden"><h3 className="app-admin-card-title">{title}</h3><div className="space-y-3 px-5 py-4">{children}</div></section>; }
