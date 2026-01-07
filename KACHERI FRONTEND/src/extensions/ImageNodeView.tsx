// KACHERI FRONTEND/src/extensions/ImageNodeView.tsx
// React NodeView for enhanced image with resize handles and caption

import React, { useCallback, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

const MIN_WIDTH = 50;
const MAX_WIDTH_PERCENT = 100;

export default function ImageNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const { src, alt, title, width, align, caption } = node.attrs;

  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [_naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  // Track natural image dimensions for aspect ratio
  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setNaturalSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
    }
  }, []);

  // Resize handle logic
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!imageRef.current || !wrapperRef.current) return;

      const startX = e.clientX;
      const startWidth = imageRef.current.offsetWidth;
      const containerWidth = wrapperRef.current.parentElement?.offsetWidth || startWidth;

      setIsResizing(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        let newWidth = startWidth + deltaX;

        // Clamp to min/max
        newWidth = Math.max(MIN_WIDTH, newWidth);
        newWidth = Math.min(containerWidth, newWidth);

        // Convert to percentage for responsive behavior
        const widthPercent = Math.round((newWidth / containerWidth) * 100);
        const clampedPercent = Math.min(widthPercent, MAX_WIDTH_PERCENT);

        updateAttributes({ width: `${clampedPercent}%` });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [updateAttributes]
  );

  // Caption change handler
  const handleCaptionChange = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      const newCaption = e.currentTarget.textContent || "";
      if (newCaption !== caption) {
        updateAttributes({ caption: newCaption });
      }
    },
    [caption, updateAttributes]
  );

  // Prevent editor selection when clicking on caption
  const handleCaptionClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <NodeViewWrapper
      className={`kacheri-image-wrapper ${selected ? "selected" : ""}`}
      data-align={align || "center"}
    >
      <figure
        className="kacheri-image"
        data-align={align || "center"}
        ref={wrapperRef}
      >
        <div className={`image-container ${selected ? "selected" : ""} ${isResizing ? "resizing" : ""}`}>
          <img
            ref={imageRef}
            src={src}
            alt={alt || ""}
            title={title || ""}
            style={{ width: width || "auto" }}
            onLoad={handleImageLoad}
            draggable={false}
          />

          {/* Resize handle - only show when selected */}
          {selected && (
            <div
              className="image-resize-handle"
              onMouseDown={handleResizeStart}
              title="Drag to resize"
            />
          )}
        </div>

        {/* Caption - always shown, editable when selected */}
        <figcaption
          contentEditable={selected}
          suppressContentEditableWarning
          onBlur={handleCaptionChange}
          onClick={handleCaptionClick}
          data-placeholder="Add a caption..."
          className={!caption ? "empty" : ""}
        >
          {caption}
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}
