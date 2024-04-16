import { Reference } from "./medium";

interface Page {
  id: string;
  page_type: number;
}

export async function listPopular(db: D1Database) {
  return db
    .prepare(
      `SELECT title, total_clap_count, 
        post_id, 
        date(published_at, 'unixepoch') published_at,
        COALESCE(u.name, '') author,
        COALESCE(c.name, '') collection, 
        recommend_count, response_count, reading_time, tags, is_paid
      FROM posts p
      LEFT OUTER JOIN pages c
        ON c.id = p.collection
		    AND c.page_type = 2
      LEFT OUTER JOIN pages u
        ON u.id = p.creator
        AND u.page_type = 1
      WHERE total_clap_count > 10000
      OR total_clap_count/(julianday('now')-julianday(published_at, 'unixepoch'))  > 100
      ORDER BY total_clap_count DESC;`
    )
    .all();
}
export async function logPage(db: D1Database, page: Page) {
  return db
    .prepare(
      `
      UPDATE pages 
      SET last_query = ? 
      WHERE id = ? 
      AND page_type = ?;`
    )
    .bind(Math.floor(Date.now() / 1000), page.id, page.page_type)
    .run();
}

export async function initDB(db: D1Database): Promise<D1Result<unknown>[]> {
  const posts = db.prepare(`CREATE TABLE IF NOT EXISTS posts (
          post_id TEXT NOT NULL PRIMARY KEY,
          title TEXT NOT NULL,
          published_at INTEGER NOT NULL,
          updated_at INTEGER,
          collection TEXT,
          creator TEXT NOT NULL,
          is_paid INTEGER NOT NULL DEFAULT 0,
          reading_time REAL,
          total_clap_count INTEGER,
          tags TEXT,
          subtitle TEXT,
          recommend_count INTEGER,
          response_count INTEGER
      );`);
  const pages = db.prepare(`CREATE TABLE IF NOT EXISTS "pages" (
          id TEXT NOT NULL, 
          name TEXT, 
          page_type INTEGER NOT NULL, 
          last_query INTEGER, 
          PRIMARY KEY (id, page_type)
      );`);
  // need a starting point for crawling
  const pageInsert = db
    .prepare(
      `INSERT INTO pages(id, page_type) 
      values(?, ?)
      ON CONFLICT (id, page_type) DO UPDATE SET 
      name = COALESCE(EXCLUDED.name, pages.name);`
    )
    .bind("255dbed17b9e", 2);
  return db.batch([posts, pages, pageInsert]);
}

export async function queryPages(db: D1Database): Promise<D1Result<Page>> {
  return db
    .prepare(
      `SELECT id, page_type
      FROM pages
      ORDER BY last_query, page_type DESC
      LIMIT 2;`
    )
    .all<Page>();
}

export async function saveMedium(
  references: Reference,
  db: D1Database
): Promise<D1Result<unknown>[]> {
  const batch: D1PreparedStatement[] = [];
  const tags: string[] = [];
  if (references.Post && Object.keys(references.Post).length > 0) {
    const postInsert = db.prepare(`INSERT INTO posts(
      post_id,
      title,
      published_at,
      updated_at,
      collection,
      creator,
      is_paid,
      reading_time,
      total_clap_count,
      tags,
      subtitle,
      recommend_count,
      response_count
  ) values(
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(post_id) 
    DO UPDATE SET 
    title = EXCLUDED.title,
    published_at = EXCLUDED.published_at,
    updated_at = EXCLUDED.updated_at,
    collection = EXCLUDED.collection,
    creator = EXCLUDED.creator,
    is_paid = EXCLUDED.is_paid,
    reading_time = EXCLUDED.reading_time,
    total_clap_count = EXCLUDED.total_clap_count,
    tags = EXCLUDED.tags,
    subtitle = EXCLUDED.subtitle,
    recommend_count = EXCLUDED.recommend_count,
    response_count = EXCLUDED.response_count
  ;`);
    for (const key in references.Post) {
      const post = references.Post[key];
      const postTags = post.virtuals.tags.map(function (tag) {
        return tag.slug;
      });
      tags.push(...postTags);
      batch.push(
        postInsert.bind(
          post.id,
          post.title,
          post.firstPublishedAt / 1000,
          post.updatedAt / 1000,
          post.homeCollectionId,
          post.creatorId,
          post.isSubscriptionLocked,
          post.virtuals.readingTime,
          post.virtuals.totalClapCount,
          postTags.join(","),
          post.virtuals.subtitle,
          post.virtuals.recommends,
          post.virtuals.responsesCreatedCount
        )
      );
    }
  }

  const pageInsert = db.prepare(`
  INSERT INTO pages(id, name, page_type) 
  values(?, ?, ?)
  ON CONFLICT (id, page_type) DO UPDATE SET 
  name = COALESCE(EXCLUDED.name, pages.name);`);
  if (references.Collection && Object.keys(references.Collection).length > 0) {
    for (const key in references.Collection) {
      const page = references.Collection[key];
      batch.push(pageInsert.bind(page.id, page.name, 2));
    }
  }
  if (references.User && Object.keys(references.User).length > 0) {
    for (const key in references.User) {
      const page = references.User[key];
      batch.push(pageInsert.bind(page.userId, page.name, 1));
    }
  }
  if (tags.length > 0) {
    for (const tag of tags) {
      batch.push(pageInsert.bind(tag, null, 0));
    }
  }

  if (batch.length > 0) {
    console.log("saving", batch.length, "posts and pages");
    return db.batch(batch);
  }
  return [];
}
