import { QueryClient } from "@tanstack/react-query";

/** Web 应用共享的 QueryClient；独立文件便于测试在不加载 UI provider 的情况下清理异步任务。 */
export const queryClient = new QueryClient();
