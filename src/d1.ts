import { Reference } from "./medium";

interface Page {
  id: string;
  page_type: number;
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
    .bind(Math.floor(Date.now() / 1000), page.id, page.page_type);
}

export async function initDB(db: D1Database): Promise<D1Result<unknown>[]> {
  const posts = db.prepare(`CREATE TABLE IF NOT EXISTS posts (
          post_id text not null primary key,
          title TEXT not null,
          published_at INTEGER not null,
          updated_at INTEGER,
          collection text,
          creator text not null,
          is_paid INTEGER not null default 0,
          reading_time REAL,
          total_clap_count INTEGER,
          tags TEXT,
          subtitle TEXT,
          recommend_count INTEGER,
          response_count INTEGER
      );`);
  const pages = db.prepare(`CREATE TABLE IF NOT EXISTS "pages" (
          id text not null, 
          name text, 
          page_type integer not null, 
          last_query integer, 
          PRIMARY KEY (id, page_type)
      );`);
  return db.batch([posts, pages]);
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
  const pageInsert = db.prepare(`
  INSERT INTO pages(id, name, page_type) 
  values(?, ?, ?)
  ON CONFLICT (id, page_type) DO UPDATE SET 
  name = COALESCE(EXCLUDED.name, pages.name);`);
  const batch = [];
  const tags = [];
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
        post.firstPublishedAt,
        post.updatedAt,
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
  for (const key in references.Collection) {
    const page = references.Collection[key];
    batch.push(pageInsert.bind(page.id, page.name, 2));
  }
  for (const key in references.User) {
    const page = references.User[key];
    batch.push(pageInsert.bind(page.userId, page.name, 1));
  }
  for (const tag of tags) {
    batch.push(pageInsert.bind(tag, null, 0));
  }
  return db.batch(batch);
}
