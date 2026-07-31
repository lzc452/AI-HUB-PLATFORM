import type { ComponentPropsWithoutRef } from "react";

function TestIcon(props: ComponentPropsWithoutRef<"span">) {
  return <span {...props} />;
}

export const AppstoreOutlined = TestIcon;
export const CheckCircleOutlined = TestIcon;
export const ClockCircleOutlined = TestIcon;
export const DeploymentUnitOutlined = TestIcon;
export const ExperimentOutlined = TestIcon;
export const SafetyCertificateOutlined = TestIcon;
