import { Modal, Typography } from "antd";

import type { MarketplaceGuideItem } from "./marketplaceGuide";

const { Paragraph, Text, Title } = Typography;

interface MarketplaceGuideModalProps {
  item: MarketplaceGuideItem | null;
  onClose: () => void;
}

/** 使用指南弹窗：展示对应条目的引导句、分步操作、问答与提示。 */
export function MarketplaceGuideModal({
  item,
  onClose,
}: MarketplaceGuideModalProps) {
  return (
    <Modal
      footer={null}
      onCancel={onClose}
      open={item !== null}
      title={item?.title}
      width={640}
    >
      {item ? (
        <div className="space-y-4">
          <Paragraph className="!mb-0 text-sm text-[#595959]">
            {item.intro}
          </Paragraph>
          {item.steps.length > 0 ? (
            <section className="space-y-2">
              <Title className="!mb-0 !mt-0 !text-sm" level={5}>
                操作步骤
              </Title>
              <ol className="m-0 list-decimal space-y-1.5 pl-5 text-sm text-[#1f1f1f]">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          ) : null}
          {item.faq && item.faq.length > 0 ? (
            <section className="space-y-2">
              <Title className="!mb-0 !mt-0 !text-sm" level={5}>
                高频问题
              </Title>
              <ul className="m-0 list-none space-y-2">
                {item.faq.map(({ answer, question }) => (
                  <li key={question}>
                    <div className="text-sm font-medium text-[#1f1f1f]">
                      问：{question}
                    </div>
                    <div className="text-sm text-[#595959]">答：{answer}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {item.tip ? (
            <blockquote className="m-0 rounded-md border-l-4 border-[#1677ff] bg-[#f0f7ff] px-3 py-2 text-sm text-[#1f1f1f]">
              <Text className="font-medium text-[#1677ff]">提示：</Text>
              {item.tip}
            </blockquote>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
