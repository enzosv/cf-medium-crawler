import { initDB, listPopular, logPage, queryPages, saveMedium } from "./d1";
import { Next, fetchMedium } from "./medium";

export interface Env {
  DB: D1Database;
}
const ROOTURL = "https://medium.com";

export default {
  async scheduled(event: Event, env: Env, ctx: ExecutionContext) {
    const startTime = Date.now();
    do {
      await importMedium(env.DB);
    } while (Date.now() - startTime < 30000);
  },
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return new Response(JSON.stringify(await listPopular(env.DB)));
  },
};

let contributions = 0;

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
      if (next?.ignoredIds) {
        url.searchParams.append("ignoredIds", next.ignoredIds.join(","));
      }
      if (next?.page) {
        url.searchParams.append("page", next.page.toString());
      }
      if (next?.to) {
        url.searchParams.append("next", next.to);
      }
      try {
        const payload = await fetchMedium(url.toString());
        await saveMedium(payload.references, db);
        contributions++;
        const newNext = payload.paging.next;
        if (newNext) {
          if (
            next &&
            (newNext.to <= next.to ||
              newNext.page <= next.page ||
              newNext.ignoredIds == next.ignoredIds)
          ) {
            next = undefined;
            break;
          }
          next = payload.paging.next;
        }
      } catch (error) {
        console.error(error);
        return;
      }
    } while (next);
    await logPage(db, page);
  }
}
