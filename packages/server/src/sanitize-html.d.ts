/**
 * 本地类型声明：sanitize-html 未随包提供类型，且当前环境无法安装 @types/sanitize-html
 * （pnpm 在 Windows 下锁文件重命名被拒）。此处仅声明本项目实际使用到的 API，
 * 足以在编译期约束 content-security.ts 的调用。待可正常安装 @types/sanitize-html 后，
 * 可删除本文件（二者不应同时存在，否则会出现重复声明冲突）。
 *
 * 注意：本文件为 .d.ts 声明文件，`declare module "sanitize-html"` 在此为环境模块声明，
 * 而非对已有模块的扩充，因此即便 sanitize-html 是无类型的 JS 模块也能正常生效。
 * apps/api 与 apps/worker 直接编译 server 源码，故已在各自 tsconfig 的 include 中
 * 显式引用本文件，以保证类型声明对二者可见。
 */
declare module "sanitize-html" {
  export type AllowedAttributes = Record<string, string[]>;

  export interface IAttributes {
    [attr: string]: string;
  }

  export type TransformFunction = (
    tagName: string,
    attribs: IAttributes,
  ) => { tagName: string; attribs: IAttributes } | string;

  export interface IOptions {
    allowedTags?: false | string[];
    allowedAttributes?: AllowedAttributes;
    allowedSchemes?: string[];
    allowedSchemesAppliedToAttributes?: string[];
    allowProtocolRelative?: boolean;
    transformTags?: Record<string, TransformFunction> | TransformFunction;
    [key: string]: unknown;
  }

  export function sanitize(html: string, options?: IOptions): string;
  export function getDefaultOptions(): IOptions;

  const _default: typeof sanitize;
  export default _default;
}
