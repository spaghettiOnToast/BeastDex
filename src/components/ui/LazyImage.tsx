import { memo, useState, useRef, useEffect } from "react";
import { imageLoadQueue } from "../../utils/imageLoadQueue";

type LazyImageProps = {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
};

export const LazyImage = memo(function LazyImage({
  src,
  alt,
  className = "",
  placeholder,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isInView) {
          setIsInView(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "100px",
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isInView]);

  // Use queue when image comes into view
  useEffect(() => {
    if (!isInView || loadingRef.current || isLoaded || isError) return;

    loadingRef.current = true;
    imageLoadQueue
      .loadImage(src)
      .then(() => {
        setIsLoaded(true);
        onLoad?.();
      })
      .catch(() => {
        setIsError(true);
        onError?.();
      });
  }, [isInView, src, isLoaded, isError, onLoad, onError]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setIsError(true);
    onError?.();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {!isLoaded && !isError && (
        <div className="absolute inset-0 bg-gray-800 animate-pulse rounded" />
      )}

      {isInView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`${className} ${
            isLoaded ? "opacity-100" : "opacity-0"
          } transition-opacity duration-300`}
          style={{ imageRendering: "pixelated" }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400 text-sm rounded">
          {placeholder || "Failed to load"}
        </div>
      )}
    </div>
  );
});