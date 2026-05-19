import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiClient";

export function SmsTemplateManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [bodyCharCount, setBodyCharCount] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  // Update character count when body changes
  useEffect(() => {
    setBodyCharCount(body.length);
  }, [body]);
  // Handle image file selection and preview
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUploadError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImageUploadError("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError("Image must be less than 5MB.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUploadError(null);
  };
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const res = await apiFetch("/api/sms/templates/");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : data.templates || []);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      let finalImageUrl = imageUrl;
      // If a file is selected, upload it first
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        // You must have an /api/upload endpoint that returns { url }
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.url) {
          throw new Error(uploadData.error || "Image upload failed");
        }
        finalImageUrl = uploadData.url;
      }
      let res;
      if (selectedId) {
        // Update existing template
        res = await apiFetch(`/api/sms/templates/${selectedId}`, {
          method: "PUT",
          body: JSON.stringify({ name, body, media_url: finalImageUrl }),
        });
      } else {
        // Create new template
        res = await apiFetch("/api/sms/templates/", {
          method: "POST",
          body: JSON.stringify({ name, body, media_url: finalImageUrl }),
        });
      }
      if (!res.ok)
        throw new Error(
          selectedId ? "Failed to update template" : "Failed to save template",
        );
      setMsg(selectedId ? "Template updated!" : "Template saved!");
      setName("");
      setBody("");
      setImageUrl("");
      setSelectedId(null);
      setImageFile(null);
      setImagePreview(null);
      fetchTemplates();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // When editing, populate form
  const handleEdit = (tpl: any) => {
    setSelectedId(tpl.id || tpl._id || tpl.uuid);
    setName(tpl.name || "");
    setBody(tpl.body || "");
    setImageUrl(tpl.image_url || "");
    setMsg(null);
  };

  // Cancel editing
  const handleCancel = () => {
    setSelectedId(null);
    setName("");
    setBody("");
    setImageUrl("");
    setMsg(null);
  };

  return (
    <div className="space-y-6 p-4 bg-white rounded shadow">
      <h2 className="text-lg font-bold">SMS Template Manager</h2>
      {/* Template List */}
      <div className="mb-4">
        <div className="font-semibold mb-2">Existing Templates:</div>
        <ul className="divide-y">
          {templates.length === 0 && (
            <li className="text-gray-500 text-sm">No templates found.</li>
          )}
          {templates.map((tpl) => (
            <li
              key={tpl.id || tpl._id || tpl.uuid}
              className="flex items-center justify-between py-2"
            >
              <div>
                <span className="font-medium">{tpl.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {tpl.body?.slice(0, 40)}
                  {tpl.body?.length > 40 ? "..." : ""}
                </span>
              </div>
              <button
                className="text-blue-600 hover:underline text-sm"
                onClick={() => handleEdit(tpl)}
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="input w-full border p-2 rounded"
          placeholder="Template Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <textarea
          className="input w-full border p-2 rounded"
          placeholder="Body (use {name})"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
        />
        <div
          className={`text-xs mt-1 ${bodyCharCount > 1590 ? "text-red-500" : "text-gray-500"}`}
        >
          {bodyCharCount} characters
        </div>
        {/* Image upload and/or URL */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Image (optional)
          </label>
          <div className="flex items-center gap-2 mb-2">
            <label className="inline-block cursor-pointer px-3 py-1 bg-gray-100 text-gray-800 border border-gray-300 rounded font-medium hover:bg-gray-200">
              Choose File
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={loading}
                style={{ display: "none" }}
              />
            </label>
            <span className="text-xs text-gray-500">
              {imageFile ? imageFile.name : "No file chosen"}
            </span>
            {imageFile && (
              <button
                type="button"
                className="ml-2 text-xs text-red-500"
                onClick={handleRemoveImage}
              >
                Remove
              </button>
            )}
          </div>
          {imageUploadError && (
            <div className="text-xs text-red-500">{imageUploadError}</div>
          )}
          {imagePreview && (
            <div className="mb-2">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-32 rounded border"
              />
            </div>
          )}
          <input
            className="input w-full border p-2 rounded"
            placeholder="Image URL (optional)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={loading}
          />
          <div className="text-xs text-gray-500 mt-1">
            You can either upload an image or provide a direct URL. If both are
            provided, the uploaded image will be used.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn bg-blue-600 text-white px-4 py-2 rounded"
            type="submit"
            disabled={loading || bodyCharCount > 1590}
          >
            {loading
              ? selectedId
                ? "Updating..."
                : "Saving..."
              : selectedId
                ? "Update Template"
                : "Save Template"}
          </button>
          {selectedId && (
            <button
              type="button"
              className="btn bg-gray-200 text-gray-800 px-4 py-2 rounded"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
          )}
        </div>
        {msg && <div className="text-sm">{msg}</div>}
      </form>
    </div>
  );
}
