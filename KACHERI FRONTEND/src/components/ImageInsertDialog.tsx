// KACHERI FRONTEND/src/components/ImageInsertDialog.tsx
// Dialog for inserting images via upload or URL

import React, { useState, useRef, useCallback } from "react";
import { ImagesAPI } from "../api";
import "./imageInsertDialog.css";

type TabType = "upload" | "url";

interface Props {
  docId: string;
  open: boolean;
  onClose: () => void;
  onInsert: (opts: {
    src: string;
    alt?: string;
    width?: string;
    caption?: string;
  }) => void;
}

export default function ImageInsertDialog({
  docId,
  open,
  onClose,
  onInsert,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("upload");
  const [url, setUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setUrl("");
    setAltText("");
    setError(null);
    setPreview(null);
    setDragOver(false);
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Show preview immediately
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);
      setError(null);
      setUploading(true);

      try {
        const result = await ImagesAPI.upload(docId, file);
        onInsert({
          src: result.url,
          alt: altText || file.name.replace(/\.[^.]+$/, ""),
        });
        handleClose();
      } catch (err: any) {
        setError(err?.message || "Upload failed");
        setPreview(null);
      } finally {
        setUploading(false);
        URL.revokeObjectURL(previewUrl);
      }
    },
    [docId, altText, onInsert, handleClose]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleUrlInsert = useCallback(() => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    onInsert({
      src: trimmedUrl,
      alt: altText || "",
    });
    handleClose();
  }, [url, altText, onInsert, handleClose]);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleFileUpload(file);
          }
          return;
        }
      }
    },
    [handleFileUpload]
  );

  if (!open) return null;

  return (
    <div className="image-dialog-overlay" onClick={handleClose}>
      <div
        className="image-dialog"
        onClick={(e) => e.stopPropagation()}
        onPaste={handlePaste}
      >
        <div className="image-dialog-header">
          <h3>Insert Image</h3>
          <button className="image-dialog-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className="image-dialog-tabs">
          <button
            className={`image-dialog-tab ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            Upload
          </button>
          <button
            className={`image-dialog-tab ${activeTab === "url" ? "active" : ""}`}
            onClick={() => setActiveTab("url")}
          >
            URL
          </button>
        </div>

        <div className="image-dialog-content">
          {activeTab === "upload" && (
            <div
              className={`image-drop-zone ${dragOver ? "drag-over" : ""} ${uploading ? "uploading" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <img src={preview} alt="Preview" className="image-preview" />
              ) : (
                <div className="image-drop-content">
                  <div className="image-drop-icon">📷</div>
                  <p>
                    {uploading
                      ? "Uploading..."
                      : "Drop an image here, or click to select"}
                  </p>
                  <p className="image-drop-hint">
                    You can also paste an image (Ctrl+V)
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>
          )}

          {activeTab === "url" && (
            <div className="image-url-form">
              <label>
                Image URL
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  autoFocus
                />
              </label>

              {url && (
                <div className="image-url-preview">
                  <img
                    src={url}
                    alt="Preview"
                    onError={() => setError("Could not load image")}
                    onLoad={() => setError(null)}
                  />
                </div>
              )}
            </div>
          )}

          <label className="image-alt-input">
            Alt Text (optional)
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image for accessibility"
            />
          </label>

          {error && <div className="image-dialog-error">{error}</div>}
        </div>

        <div className="image-dialog-footer">
          <button className="button subtle" onClick={handleClose}>
            Cancel
          </button>
          {activeTab === "url" && (
            <button
              className="button primary"
              onClick={handleUrlInsert}
              disabled={!url.trim()}
            >
              Insert
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
