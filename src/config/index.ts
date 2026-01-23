const DEFAULT_PAGE_SIZE = 120;
const MAX_INITIAL_PAGES = 5;
const USERNAME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 30000; // 30 seconds
const DEBOUNCE_DELAY = 300; // 300ms

export const config = {
  pagination: {
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxInitialPages: MAX_INITIAL_PAGES,
  },

  cache: {
    usernameTtl: USERNAME_CACHE_TTL,
  },

  api: {
    requestTimeout: REQUEST_TIMEOUT,
    debounceDelay: DEBOUNCE_DELAY,
  },

  ui: {
    loadingMessages: {
      beasts: "Loading beasts...",
      usernames: "Loading usernames...",
      collection: "Loading collection...",
    },
    emptyMessages: {
      beasts: "No beasts found.",
      collection: "No beasts in this collection.",
      search: "No matching beasts found.",
    },
  },
} as const;

export type Config = typeof config;