/**
 * Image loading queue to prevent browser from being overwhelmed
 * by too many simultaneous image requests (ERR_INSUFFICIENT_RESOURCES)
 */

type QueueItem = {
  url: string;
  resolve: (success: boolean) => void;
  reject: (error: Error) => void;
};

class ImageLoadQueue {
  private queue: QueueItem[] = [];
  private loading = new Set<string>();
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
  }

  async loadImage(url: string): Promise<boolean> {
    // If already loading, wait for it
    if (this.loading.has(url)) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.loading.has(url)) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
      });
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ url, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    while (this.loading.size < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.loading.add(item.url);
      this.loadImageDirect(item.url)
        .then((success) => {
          this.loading.delete(item.url);
          item.resolve(success);
          this.processQueue();
        })
        .catch((error) => {
          this.loading.delete(item.url);
          item.reject(error);
          this.processQueue();
        });
    }
  }

  private loadImageDirect(url: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      const timeout = setTimeout(() => {
        img.src = '';
        reject(new Error('Image load timeout'));
      }, 10000); // 10 second timeout

      img.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Image failed to load'));
      };

      img.src = url;
    });
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getLoadingCount(): number {
    return this.loading.size;
  }
}

// Singleton instance
export const imageLoadQueue = new ImageLoadQueue(6);
