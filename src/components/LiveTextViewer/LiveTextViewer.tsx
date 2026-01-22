import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./LiveTextViewer.css";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OcrTextItem {
  text: string;
  bounding_box: BoundingBox;
  confidence: number;
}

interface OcrResult {
  items: OcrTextItem[];
  full_text: string;
}

interface DisplayedTextItem {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function LiveTextViewer() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [displayedTextItems, setDisplayedTextItems] = useState<DisplayedTextItem[]>([]);
  const [isMacOS, setIsMacOS] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasResized = useRef(false);

  useEffect(() => {
    // Get the image path and live text data from the backend
    Promise.all([
      invoke<string | null>("take_live_text_image_path"),
      invoke<OcrResult | null>("take_live_text_data"),
    ])
      .then(async ([path, ocr]) => {
        if (!path) {
          setError("No image path found");
          setLoading(false);
          return;
        }

        // Use convertFileSrc to get displayable URL
        const src = convertFileSrc(path);
        setImageSrc(src);
        setOcrResult(ocr);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to get live text data:", e);
        setError(`Failed to load image: ${e}`);
        setLoading(false);
      });
  }, []);

  // Calculate displayed text positions when image loads, OCR data changes, or window resizes
  useEffect(() => {
    if (!imageRef.current || !containerRef.current || !ocrResult) {
      setDisplayedTextItems([]);
      return;
    }

    const img = imageRef.current;
    const container = containerRef.current;
    
    // Get natural (original) image dimensions
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      setDisplayedTextItems([]);
      return;
    }

    // Get displayed image dimensions (accounting for object-fit: contain)
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate scale factor to fit image in container while maintaining aspect ratio
    const scaleX = containerWidth / naturalWidth;
    const scaleY = containerHeight / naturalHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Actual displayed dimensions
    const displayedWidth = naturalWidth * scale;
    const displayedHeight = naturalHeight * scale;
    
    // Calculate offset (image is centered)
    const offsetX = (containerWidth - displayedWidth) / 2;
    const offsetY = (containerHeight - displayedHeight) / 2;

    // Transform OCR coordinates from normalized (0-1, bottom-left origin) to pixel (top-left origin)
    const transformedItems: DisplayedTextItem[] = ocrResult.items.map((item) => {
      const bbox = item.bounding_box;
      
      // OCR coordinates: normalized (0-1), origin at bottom-left
      // Convert to pixel coordinates with top-left origin
      const x = bbox.x * displayedWidth;
      const y = (1.0 - bbox.y - bbox.height) * displayedHeight; // Flip Y-axis
      const width = bbox.width * displayedWidth;
      const height = bbox.height * displayedHeight;
      
      return {
        text: item.text,
        left: offsetX + x,
        top: offsetY + y,
        width,
        height,
      };
    });

    setDisplayedTextItems(transformedItems);
  }, [ocrResult, imageSrc]);

  // Recalculate positions on window resize
  useEffect(() => {
    const handleResize = () => {
      if (!imageRef.current || !containerRef.current || !ocrResult) {
        setDisplayedTextItems([]);
        return;
      }

      const img = imageRef.current;
      const container = containerRef.current;
      
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      if (naturalWidth <= 0 || naturalHeight <= 0) {
        setDisplayedTextItems([]);
        return;
      }

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      const scaleX = containerWidth / naturalWidth;
      const scaleY = containerHeight / naturalHeight;
      const scale = Math.min(scaleX, scaleY);
      
      const displayedWidth = naturalWidth * scale;
      const displayedHeight = naturalHeight * scale;
      
      const offsetX = (containerWidth - displayedWidth) / 2;
      const offsetY = (containerHeight - displayedHeight) / 2;

      const transformedItems: DisplayedTextItem[] = ocrResult.items.map((item) => {
        const bbox = item.bounding_box;
        const x = bbox.x * displayedWidth;
        const y = (1.0 - bbox.y - bbox.height) * displayedHeight;
        const width = bbox.width * displayedWidth;
        const height = bbox.height * displayedHeight;
        
        return {
          text: item.text,
          left: offsetX + x,
          top: offsetY + y,
          width,
          height,
        };
      });

      setDisplayedTextItems(transformedItems);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [ocrResult]);

  // Resize window to match image dimensions
  const handleImageLoad = async () => {
    if (hasResized.current || !imageRef.current) return;
    
    const { naturalWidth, naturalHeight } = imageRef.current;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;

    try {
      const appWindow = getCurrentWindow();
      
      // Add padding for window decorations (title bar, borders, etc.)
      const paddingX = 20;
      const paddingY = 80;
      
      // Calculate desired window size
      let windowWidth = naturalWidth + paddingX;
      let windowHeight = naturalHeight + paddingY;
      
      // Cap at 95% of common max screen size (1824x1026)
      const maxWidth = 1824;
      const maxHeight = 1026;
      
      // Scale down if needed while maintaining aspect ratio
      if (windowWidth > maxWidth || windowHeight > maxHeight) {
        const scale = Math.min(maxWidth / windowWidth, maxHeight / windowHeight);
        windowWidth = Math.floor(windowWidth * scale);
        windowHeight = Math.floor(windowHeight * scale);
      }
      
      // Ensure minimum size
      windowWidth = Math.max(windowWidth, 400);
      windowHeight = Math.max(windowHeight, 300);
      
      await appWindow.setSize(
        new LogicalSize(Math.ceil(windowWidth), Math.ceil(windowHeight))
      );
      await appWindow.center();
      
      hasResized.current = true;
    } catch (e) {
      console.warn("Failed to resize window:", e);
    }
  };

  // Note: Image file deletion is handled by the window close event in Rust

  if (loading) {
    return (
      <div className="live-text-viewer">
        <div className="live-text-loading">Loading image...</div>
      </div>
    );
  }

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  };

  if (error) {
    return (
      <div className="live-text-viewer">
        <div className="live-text-error-container">
          <div className="live-text-error">{error}</div>
          <button className="live-text-close-button" onClick={handleClose}>
            Close Window
          </button>
        </div>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="live-text-viewer">
        <div className="live-text-error">No image available</div>
      </div>
    );
  }

  return (
    <div className="live-text-viewer" ref={containerRef}>
      <img
        ref={imageRef}
        src={imageSrc}
        alt="Live Text"
        className="live-text-image"
        onLoad={handleImageLoad}
        onError={() => {
          setError("Failed to display image");
        }}
      />
      {/* Only show text overlays on non-macOS platforms (macOS has native text selection) */}
      {!isMacOS && displayedTextItems.length > 0 && (
        <div className="live-text-overlay">
          {displayedTextItems.map((item, index) => (
            <div
              key={index}
              className="live-text-item"
              style={{
                left: `${item.left}px`,
                top: `${item.top}px`,
                width: `${item.width}px`,
                height: `${item.height}px`,
              }}
            >
              {item.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
