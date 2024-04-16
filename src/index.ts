import { listPopular, logPage, queryPages, saveMedium } from "./d1";
import { Next, Reference, fetchMedium } from "./medium";

export interface Env {
  DB: D1Database;
}
const ROOTURL = "https://medium.com";

export default {
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    await importMedium(env.DB);
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const response = await (async function () {
      if (request.method == "POST") {
        const pathname = new URL(request.url).pathname;
        console.log(pathname, request.method, request.url);
        const data = await request.json();
        console.log(data);
        if (pathname == "/contribute") {
          const references = data as Reference;
          await saveMedium(references, env.DB);
          return new Response("saved");
        } else if (pathname == "/log") {
          const page = data as any;
          await logPage(env.DB, { id: page.id, page_type: page.page_type });
          return new Response("logged");
        }
      }
      return new Response(JSON.stringify(await listPopular(env.DB)));
    })();
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    if (request.method == "GET") {
      responseHeaders.set("Cache-Control", "public, max-age=3600, immutable");
      responseHeaders.set("Content-Type", "application/json");
    }
    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  },
};

async function importMedium(db: D1Database) {
  const pages = await queryPages(db);
  for (const page of pages.results) {
    let next: Next | undefined = undefined;
    do {
      const path = (function () {
        switch (page.page_type) {
          case 2:
            return `collections/${page.id}`;
          case 1:
            return `users/${page.id}/profile`;
          case 0:
            return `tags/${page.id}`;
          default:
            throw "unhandled";
        }
      })();
      const url = new URL(`${ROOTURL}/_/api/${path}/stream`);
      if (next?.ignoredIds && next.ignoredIds.length > 0) {
        url.searchParams.append("ignoredIds", next.ignoredIds.join(","));
      }
      if (next?.page) {
        url.searchParams.append("page", next.page.toString());
      }
      if (next?.to) {
        url.searchParams.append("next", next.to);
      }
      const payload = await fetchMedium(url.toString());
      if (!payload || !payload?.references) {
        break;
      }
      await saveMedium(payload.references, db);
      const newNext = payload.paging.next;
      if (newNext) {
        if (
          next &&
          (newNext.to <= next.to ||
            newNext.page <= next.page ||
            JSON.stringify(next.ignoredIds.sort()) ===
              JSON.stringify(newNext.ignoredIds.sort()))
        ) {
          break;
        }
      }
      next = newNext;
    } while (next);
    await logPage(db, page);
  }
}
