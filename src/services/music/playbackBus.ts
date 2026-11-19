/**
 * One sound at a time across the app. The SDK's beast players already pause
 * each other, but the site playlist also plays a plain MP3, which they don't
 * know about. Every player announces when it starts; the others pause.
 */
export type PlaybackSource = "playlist" | "beast";

const bus = new EventTarget();

export function announcePlayback(source: PlaybackSource): void {
  bus.dispatchEvent(new CustomEvent<PlaybackSource>("play", { detail: source }));
}

/** Called whenever a player from `source` starts. Returns the unsubscribe function. */
export function onPlayback(fn: (source: PlaybackSource) => void): () => void {
  const listener = (e: Event) => fn((e as CustomEvent<PlaybackSource>).detail);
  bus.addEventListener("play", listener);
  return () => bus.removeEventListener("play", listener);
}
