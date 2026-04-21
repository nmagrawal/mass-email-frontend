"use client"

import { useState, useRef, useCallback } from "react"
import { ImagePlus, Link, Upload, X, Loader2, Check, Copy } from "lucide-react"

interface ImagePickerProps {
  onInsert: (imageUrl: string) => void
}

export function ImagePicker({ onInsert }: ImagePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload")
  const [imageUrl, setImageUrl] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Upload failed")
      }

      setUploadedImages((prev) => [data.url, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }, [])

  const handleUrlSubmit = useCallback(() => {
    if (!imageUrl.trim()) {
      setError("Please enter an image URL")
      return
    }

    // Basic URL validation
    try {
      new URL(imageUrl)
    } catch {
      setError("Please enter a valid URL")
      return
    }

    setUploadedImages((prev) => [imageUrl.trim(), ...prev])
    setImageUrl("")
    setError(null)
  }, [imageUrl])

  const handleInsertImage = useCallback((url: string) => {
    onInsert(url)
    setIsOpen(false)
  }, [onInsert])

  const handleCopyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = url
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith("image/")) return

    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Upload failed")
      }

      setUploadedImages((prev) => [data.url, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Add image"
      >
        <ImagePlus className="h-4 w-4" />
        <span>Image</span>
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Trigger button (highlighted when open) */}
      <button
        type="button"
        onClick={() => setIsOpen(false)}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm text-foreground"
      >
        <ImagePlus className="h-4 w-4" />
        <span>Image</span>
      </button>

      {/* Dropdown panel */}
      <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-background shadow-lg">
        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "upload"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Upload className="mr-1.5 inline-block h-4 w-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "url"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link className="mr-1.5 inline-block h-4 w-4" />
            URL
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {/* Error message */}
          {error && (
            <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Upload tab */}
          {activeTab === "upload" && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                id="image-upload"
              />
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <label
                  htmlFor="image-upload"
                  className="flex cursor-pointer flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop an image or{" "}
                    <span className="text-primary">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, GIF, WebP up to 5MB
                  </p>
                </label>
              )}
            </div>
          )}

          {/* URL tab */}
          {activeTab === "url" && (
            <div className="space-y-3">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleUrlSubmit()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Add Image
              </button>
            </div>
          )}

          {/* Uploaded images gallery */}
          {uploadedImages.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Recent images
              </p>
              <div className="grid grid-cols-3 gap-2">
                {uploadedImages.slice(0, 6).map((url, index) => (
                  <div
                    key={index}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border"
                  >
                    <img
                      src={url}
                      alt={`Uploaded ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleInsertImage(url)}
                        className="rounded-md bg-primary p-1.5 text-primary-foreground transition-colors hover:bg-primary/90"
                        title="Insert image"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(url)}
                        className="rounded-md bg-secondary p-1.5 text-secondary-foreground transition-colors hover:bg-secondary/90"
                        title="Copy URL"
                      >
                        {copiedUrl === url ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
