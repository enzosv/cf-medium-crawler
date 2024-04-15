const sleepDuration = 4000;
let lastFetch = 0;
const PREFIX = "])}while(1);</x>";

interface MediumResponse {
  payload: Payload;
}

export interface Payload {
  references: Reference;
  paging: Paging;
}

interface Paging {
  next?: Next;
}

export interface Next {
  ignoredIds: string[];
  to: string;
  page: number;
}

export interface Reference {
  Collection: Record<string, Collection>;
  Post: Record<string, Post>;
  User: Record<string, User>;
}

interface Collection {
  id: string;
  name: string;
}

interface User {
  userId: string;
  name: string;
}

interface Post {
  id: string;
  title: string;
  firstPublishedAt: number;
  updatedAt: number;
  homeCollectionId?: string;
  creatorId: string;
  isSubscriptionLocked: boolean;
  virtuals: Virtuals;
}

interface Virtuals {
  readingTime: number;
  totalClapCount: number;
  tags: Tag[];
  subtitle: string;
  recommends: number;
  responsesCreatedCount: number;
}

interface Tag {
  slug: string;
}

export async function fetchMedium(url: string): Promise<Payload> {
  const dif = Date.now() - lastFetch;
  if (dif < sleepDuration) {
    // avoid rate limit
    console.log("sleeping", sleepDuration - dif);
    await new Promise((r) => setTimeout(r, sleepDuration - dif));
  }
  console.log("fetching", url);
  const res = await fetch(url);
  lastFetch = Date.now();
  let data = await res.text();
  if (data.startsWith(PREFIX)) {
    data = data.slice(PREFIX.length);
  }
  const response = JSON.parse(data) as MediumResponse;
  return response.payload;
}
