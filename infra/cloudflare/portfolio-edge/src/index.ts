import { proxyRequest } from "./proxy";

export default {
  fetch(request, env, _ctx) {
    return proxyRequest(request, env, fetch);
  },
} satisfies ExportedHandler<Env>;
