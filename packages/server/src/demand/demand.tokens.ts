export const DEMAND_SERVICE = Symbol("DEMAND_SERVICE");
export const DEMAND_STORAGE = Symbol("DEMAND_STORAGE");
/**
 * 需求附件的病毒扫描管线。
 *
 * 与 DEMAND_STORAGE 分开：存储可以缺省（不提供附件能力），
 * 但只要提供附件能力，就必须同时提供扫描——否则等于开放了一个
 * 不设防的上传入口（EICAR 会被当正常文件存进对象存储）。
 */
export const DEMAND_ATTACHMENT_PIPELINE = Symbol("DEMAND_ATTACHMENT_PIPELINE");
