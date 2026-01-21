import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import "./ScreenshotViewer.css";

export default function ScreenshotViewer() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const imageRef = useRef<HTMLImageElement>(null);
  const hasResized = useRef(false);

  useEffect(() => {
    // Get the screenshot path from the backend
    invoke<string | null>("take_screenshot_path")
      .then(async (path) => {
        if (!path) {
          setError("No screenshot path found");
          setLoading(false);
          return;
        }

        // Use convertFileSrc to get displayable URL
        const src = convertFileSrc(path);
        setImageSrc(src);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to get screenshot path:", e);
        setError(`Failed to load screenshot: ${e}`);
        setLoading(false);
      });
  }, []);

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

  // Note: Screenshot file deletion is handled by the window close event in Rust

  if (loading) {
    return (
      <div className="screenshot-viewer">
        <div className="screenshot-loading">Loading screenshot...</div>
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
      <div className="screenshot-viewer">
        <div className="screenshot-error-container">
          <div className="screenshot-error">{error}</div>
          <button className="screenshot-close-button" onClick={handleClose}>
            Close Window
          </button>
        </div>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="screenshot-viewer">
        <div className="screenshot-error">No screenshot available</div>
      </div>
    );
  }

  return (
    <div className="screenshot-viewer">
      <img
        ref={imageRef}
        src={imageSrc}
        alt="Screenshot"
        className="screenshot-image"
        onLoad={handleImageLoad}
        onError={() => {
          setError("Failed to display screenshot");
        }}
      />
    </div>
  );
}
