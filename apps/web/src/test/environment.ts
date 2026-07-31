import type { Environment } from "vitest";
import { builtinEnvironments } from "vitest/environments";

const environment: Environment = {
  name: "ai-hub-jsdom",
  transformMode: "web",
  async setup(global, options) {
    const nodeAbortController = global.AbortController;
    const nodeAbortSignal = global.AbortSignal;
    const jsdom = await builtinEnvironments.jsdom.setup(global, options);

    global.AbortController = nodeAbortController;
    global.AbortSignal = nodeAbortSignal;

    return jsdom;
  },
};

export default environment;
