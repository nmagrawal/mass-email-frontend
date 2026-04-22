import { useEffect, useState } from "react";

interface EmailTemplate {
  _id?: string;
  name: string;
  subject: string;
  body: string;
  sequence?: number;
}

export function EmailTemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Load templates
  useEffect(() => {
    setLoading(true);
    fetch("/api/emails/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setError(null);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, [success]);

  // Start editing a template
  const startEdit = (tpl?: EmailTemplate) => {
    setEditing(
      tpl || {
        name: "",
        subject: "",
        body: "",
      },
    );
    setSuccess(null);
    setError(null);
  };

  // Save or update template
  const saveTemplate = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/emails/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess("Template saved");
      setEditing(null);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 border rounded bg-background">
      <h2 className="text-lg font-semibold mb-2">Email Templates</h2>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-500 mb-2">{error}</div>
      ) : (
        <>
          <button
            className="mb-2 px-3 py-1 rounded bg-primary text-primary-foreground"
            onClick={() => startEdit()}
          >
            + New Template
          </button>
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr>
                <th className="border-b p-2 text-left">Seq</th>
                <th className="border-b p-2 text-left">Name</th>
                <th className="border-b p-2 text-left">Subject</th>
                <th className="border-b p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl._id}>
                  <td className="border-b p-2">{tpl.sequence}</td>
                  <td className="border-b p-2">{tpl.name}</td>
                  <td className="border-b p-2">{tpl.subject}</td>
                  <td className="border-b p-2">
                    <button
                      className="px-2 py-1 rounded border mr-2"
                      onClick={() => startEdit(tpl)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {editing && (
        <div className="border p-4 rounded bg-muted mb-2">
          <h3 className="font-semibold mb-2">
            {editing._id ? "Edit Template" : "New Template"}
          </h3>
          <div className="mb-2">
            <label className="block mb-1">Name</label>
            <input
              className="w-full border rounded p-2"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              disabled={saving}
            />
          </div>
          <div className="mb-2">
            <label className="block mb-1">Subject</label>
            <input
              className="w-full border rounded p-2"
              value={editing.subject}
              onChange={(e) =>
                setEditing({ ...editing, subject: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="mb-2">
            <label className="block mb-1">Body</label>
            <textarea
              className="w-full border rounded p-2"
              rows={6}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              disabled={saving}
            />
          </div>
          <div className="mb-2">
            <label className="block mb-1">Sequence</label>
            <input
              className="w-24 border rounded p-2"
              type="number"
              value={editing.sequence ?? ""}
              onChange={(e) =>
                setEditing({ ...editing, sequence: Number(e.target.value) })
              }
              disabled={saving}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded bg-primary text-primary-foreground"
              onClick={saveTemplate}
              disabled={saving}
            >
              Save
            </button>
            <button
              className="px-3 py-1 rounded border"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {success && <div className="text-green-600 mt-2">{success}</div>}
    </div>
  );
}
