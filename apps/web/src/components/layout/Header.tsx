import { Layout, Tag } from "antd";

const { Header: LayoutHeader } = Layout;

export function Header() {
  return (
    <LayoutHeader
      className="border-b border-solid border-[#d9d9d9]"
      style={{
        background: "#fff",
        height: "auto",
        lineHeight: "normal",
        padding: 0,
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-sm text-[#595959]">
              企业内部 AI 应用共享平台
            </p>
            <p className="m-0 text-lg font-semibold text-[#1f1f1f]">
              React 应用壳体基线
            </p>
          </div>
          <Tag color="blue">Phase 01 / Foundation</Tag>
        </div>
      </div>
    </LayoutHeader>
  );
}
