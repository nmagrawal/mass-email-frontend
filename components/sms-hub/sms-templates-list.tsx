'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/apiClient';
import {
  Loader2,
  Trash2,
  Edit2,
  Plus,
  FileText,
  Search,
  RefreshCw,
  Copy,
  X,
  ImageIcon,
  SortAsc,
  SortDesc,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Template {
  _id?: string;
  id?: string;
  name: string;
  body: string;
  media_url?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
}

type SortBy =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'length_asc'
  | 'length_desc';

type FilterBy =
  | 'all'
  | 'with_media'
  | 'without_media'
  | 'long_sms'
  | 'single_sms';

const READ_MORE_LIMIT = 220;

export function SmsTemplatesList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');

  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [formData, setFormData] = useState({
    name: '',
    body: '',
    media_url: '',
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  function getTemplateId(template: Template) {
    return template._id || template.id || '';
  }

  function getTemplateDate(template: Template) {
    return (
      template.updatedAt ||
      template.updated_at ||
      template.createdAt ||
      template.created_at ||
      ''
    );
  }

  function getSmsSegments(text: string) {
    if (!text) return 0;
    return Math.ceil(text.length / 160);
  }

  function getCharacterStatusClass(length: number) {
    if (length <= 160) return 'text-cyan-400';
    if (length <= 320) return 'text-orange-400';
    return 'text-red-400';
  }

  function getTemplatePreview(body: string, isExpanded: boolean) {
    if (!body) return '';
    if (isExpanded || body.length <= READ_MORE_LIMIT) return body;

    return `${body.slice(0, READ_MORE_LIMIT).trim()}...`;
  }

  function toggleReadMore(templateId: string) {
    setExpandedTemplateIds((prev) => {
      const next = new Set(prev);

      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }

      return next;
    });
  }

  async function getErrorMessage(res: Response, fallback: string) {
    try {
      const data = await res.json();

      if (typeof data?.detail === 'string') return data.detail;

      if (Array.isArray(data?.detail)) {
        return (
          data.detail
            .map((item: any) => item?.msg || item?.message)
            .filter(Boolean)
            .join(', ') || fallback
        );
      }

      return data.error || data.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function fetchTemplates(isRefresh = false) {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const res = await apiFetch('/api/sms/templates/');

      if (!res.ok) {
        const message = await getErrorMessage(res, 'Failed to fetch templates');
        throw new Error(message);
      }

      const data = await res.json();

      const templatesList = Array.isArray(data)
        ? data
        : Array.isArray(data.templates)
          ? data.templates
          : [];

      setTemplates(templatesList);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch templates');
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();

    const name = formData.name.trim();
    const body = formData.body.trim();
    const mediaUrl = formData.media_url.trim();

    if (!name || !body) {
      setError('Name and body are required');
      return;
    }

    if (body.length > 1000) {
      setError('Message body is too long. Please keep it under 1000 characters.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const method = editingId ? 'PUT' : 'POST';
      const url = editingId
        ? `/api/sms/templates/${editingId}`
        : '/api/sms/templates/';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name,
          body,
          media_url: mediaUrl || undefined,
        }),
      });

      if (!res.ok) {
        const message = await getErrorMessage(res, 'Failed to save template');
        throw new Error(message);
      }

      setFormData({ name: '', body: '', media_url: '' });
      setIsCreating(false);
      setEditingId(null);

      await fetchTemplates(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
      console.error('Error saving template:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!id) {
      setError('Template ID is missing');
      return;
    }

    const confirmed = confirm(
      'Are you sure you want to delete this template? This action cannot be undone.',
    );

    if (!confirmed) return;

    try {
      setDeletingId(id);
      setError(null);

      const res = await apiFetch(`/api/sms/templates/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const message = await getErrorMessage(res, 'Failed to delete template');
        throw new Error(message);
      }

      await fetchTemplates(true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
      console.error('Error deleting template:', err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDuplicateTemplate(template: Template) {
    const templateId = getTemplateId(template);

    try {
      setDuplicatingId(templateId);
      setError(null);

      const res = await apiFetch('/api/sms/templates/', {
        method: 'POST',
        body: JSON.stringify({
          name: `${template.name} Copy`,
          body: template.body,
          media_url: template.media_url || undefined,
        }),
      });

      if (!res.ok) {
        const message = await getErrorMessage(res, 'Failed to duplicate template');
        throw new Error(message);
      }

      await fetchTemplates(true);
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate template');
      console.error('Error duplicating template:', err);
    } finally {
      setDuplicatingId(null);
    }
  }

  function handleEditTemplate(template: Template) {
    const id = getTemplateId(template);

    if (!id) {
      setError('Template ID is missing');
      return;
    }

    setFormData({
      name: template.name || '',
      body: template.body || '',
      media_url: template.media_url || '',
    });

    setEditingId(id);
    setIsCreating(true);
    setError(null);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleStartCreate() {
    setIsCreating(true);
    setEditingId(null);
    setFormData({ name: '', body: '', media_url: '' });
    setError(null);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setIsCreating(false);
    setEditingId(null);
    setFormData({ name: '', body: '', media_url: '' });
    setError(null);
  }

  function clearSearchAndFilters() {
    setSearchQuery('');
    setFilterBy('all');
    setSortBy('newest');
  }

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = [...templates];

    if (query) {
      result = result.filter((template) => {
        const name = template.name?.toLowerCase() || '';
        const body = template.body?.toLowerCase() || '';
        const mediaUrl = template.media_url?.toLowerCase() || '';

        return (
          name.includes(query) ||
          body.includes(query) ||
          mediaUrl.includes(query)
        );
      });
    }

    result = result.filter((template) => {
      const bodyLength = template.body?.length || 0;
      const hasMedia = Boolean(template.media_url);

      if (filterBy === 'with_media') return hasMedia;
      if (filterBy === 'without_media') return !hasMedia;
      if (filterBy === 'long_sms') return bodyLength > 160;
      if (filterBy === 'single_sms') return bodyLength <= 160;

      return true;
    });

    result.sort((a, b) => {
      const nameA = a.name?.toLowerCase() || '';
      const nameB = b.name?.toLowerCase() || '';
      const lengthA = a.body?.length || 0;
      const lengthB = b.body?.length || 0;
      const dateA = new Date(getTemplateDate(a)).getTime() || 0;
      const dateB = new Date(getTemplateDate(b)).getTime() || 0;

      if (sortBy === 'name_asc') return nameA.localeCompare(nameB);
      if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
      if (sortBy === 'length_asc') return lengthA - lengthB;
      if (sortBy === 'length_desc') return lengthB - lengthA;
      if (sortBy === 'oldest') return dateA - dateB;

      return dateB - dateA;
    });

    return result;
  }, [templates, searchQuery, filterBy, sortBy]);

  const stats = useMemo(() => {
    const total = templates.length;
    const withMedia = templates.filter((template) => template.media_url).length;
    const longSms = templates.filter(
      (template) => (template.body?.length || 0) > 160,
    ).length;
    const singleSms = templates.filter(
      (template) => (template.body?.length || 0) <= 160,
    ).length;

    return {
      total,
      withMedia,
      longSms,
      singleSms,
    };
  }, [templates]);

  const formBodyLength = formData.body.length;
  const formSmsSegments = getSmsSegments(formData.body);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <Loader2
            className="animate-spin text-cyan-400 mx-auto mb-3"
            size={40}
          />
          <p className="text-slate-300">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-8 w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <FileText className="text-cyan-400" size={30} />
              <h2 className="text-3xl font-bold text-white">SMS Templates</h2>
            </div>

            <p className="text-slate-400 text-sm mt-2">
              Create, search, edit, duplicate, and manage reusable SMS templates.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => fetchTemplates(true)}
              disabled={refreshing}
              variant="outline"
              className="border-slate-600 text-slate-600 hover:bg-slate-700/50"
            >
              {refreshing ? (
                <Loader2 size={18} className="mr-2 animate-spin" />
              ) : (
                <RefreshCw size={18} className="mr-2" />
              )}
              Refresh
            </Button>

            {!isCreating && !editingId && (
              <Button
                type="button"
                onClick={handleStartCreate}
                className="bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/50"
              >
                <Plus size={18} className="mr-2" />
                New Template
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-5 bg-red-500/10 text-red-300 rounded-xl border border-red-500/20 flex items-start gap-3">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />

            <div className="flex-1">{error}</div>

            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">
              Total
            </p>
            <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">
              Single SMS
            </p>
            <p className="text-2xl font-bold text-cyan-300 mt-1">
              {stats.singleSms}
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">
              Long SMS
            </p>
            <p className="text-2xl font-bold text-orange-300 mt-1">
              {stats.longSms}
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4">
            <p className="text-xs text-slate-400 font-semibold uppercase">
              With Media
            </p>
            <p className="text-2xl font-bold text-purple-300 mt-1">
              {stats.withMedia}
            </p>
          </div>
        </div>

        {(isCreating || editingId) && (
          <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="text-cyan-400" size={24} />
              <h3 className="text-2xl font-bold text-white">
                {editingId ? 'Edit Template' : 'Create New Template'}
              </h3>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-slate-200 block mb-2">
                  Template Name
                </label>

                <Input
                  placeholder="e.g., Welcome Message"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-200 block mb-2">
                  Message Body
                </label>

                <Textarea
                  placeholder="Enter your SMS message"
                  value={formData.body}
                  onChange={(e) =>
                    setFormData({ ...formData, body: e.target.value })
                  }
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg min-h-32 focus:ring-2 focus:ring-cyan-500"
                  required
                />

                <div className="mt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-slate-400">
                  <p>
                    Characters:{' '}
                    <span className={getCharacterStatusClass(formBodyLength)}>
                      {formBodyLength}
                    </span>{' '}
                    / 160
                  </p>

                  <p>
                    Estimated SMS segments:{' '}
                    <span className={getCharacterStatusClass(formBodyLength)}>
                      {formSmsSegments}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-200 block mb-2">
                  Media URL Optional
                </label>

                <Input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={formData.media_url}
                  onChange={(e) =>
                    setFormData({ ...formData, media_url: e.target.value })
                  }
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-linear-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : editingId ? (
                    'Update Template'
                  ) : (
                    'Create Template'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="border-slate-600 text-slate-600 hover:bg-slate-700/50"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-slate-800/70 border border-slate-700 rounded-2xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <Input
                placeholder="Search by name, message, or media URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-900/60 border-slate-600 text-white placeholder:text-slate-500 rounded-lg"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value as FilterBy)}
              className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-600 text-slate-200"
            >
              <option value="all">All templates</option>
              <option value="single_sms">Single SMS</option>
              <option value="long_sms">Long SMS</option>
              <option value="with_media">With media</option>
              <option value="without_media">Without media</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-600 text-slate-200"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_asc">Name A to Z</option>
              <option value="name_desc">Name Z to A</option>
              <option value="length_asc">Shortest first</option>
              <option value="length_desc">Longest first</option>
            </select>

            <Button
              type="button"
              variant="outline"
              onClick={clearSearchAndFilters}
              className="border-slate-600 text-slate-600 hover:bg-slate-700/50"
            >
              Clear
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <p>
              Showing{' '}
              <span className="text-white font-semibold">
                {filteredTemplates.length}
              </span>{' '}
              of{' '}
              <span className="text-white font-semibold">
                {templates.length}
              </span>{' '}
              templates
            </p>

            <div className="hidden md:flex items-center gap-2">
              {sortBy.includes('asc') ? (
                <SortAsc size={16} />
              ) : (
                <SortDesc size={16} />
              )}
              <span>Sorted by {sortBy.replaceAll('_', ' ')}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="gap-4 grid-rows-1 auto-cols-fr grid">
            {templates.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-slate-800/50 border border-slate-700 rounded-2xl">
                <FileText
                  size={48}
                  className="mx-auto text-slate-500 mb-3 opacity-50"
                />

                <p className="text-slate-300 text-lg font-medium">
                  No templates yet
                </p>

                <p className="text-slate-500 text-sm mt-1">
                  Create one to get started.
                </p>

                <Button
                  type="button"
                  onClick={handleStartCreate}
                  className="mt-5 bg-linear-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  <Plus size={18} className="mr-2" />
                  Create Template
                </Button>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-slate-800/50 border border-slate-700 rounded-2xl">
                <Search
                  size={48}
                  className="mx-auto text-slate-500 mb-3 opacity-50"
                />

                <p className="text-slate-300 text-lg font-medium">
                  No matching templates found
                </p>

                <p className="text-slate-500 text-sm mt-1">
                  Try a different keyword or clear your filters.
                </p>

                <Button
                  type="button"
                  onClick={clearSearchAndFilters}
                  variant="outline"
                  className="mt-5 border-slate-600 text-slate-300 hover:bg-slate-700/50"
                >
                  Clear Search and Filters
                </Button>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const templateId = getTemplateId(template);
                const body = template.body || '';
                const bodyLength = body.length;
                const smsSegments = getSmsSegments(body);
                const isDeleting = deletingId === templateId;
                const isDuplicating = duplicatingId === templateId;
                const isExpanded = expandedTemplateIds.has(templateId);
                const shouldShowReadMore = bodyLength > READ_MORE_LIMIT;
                const previewBody = getTemplatePreview(body, isExpanded);

                return (
                  <div
                    key={templateId}
                    className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 hover:border-slate-600 hover:shadow-xl transition-all duration-300 group"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-lg text-white group-hover:text-cyan-300 transition-colors">
                            {template.name}
                          </h4>

                          {template.media_url && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                              <ImageIcon size={12} />
                              Media
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${
                              bodyLength <= 160
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                                : 'bg-orange-500/10 text-orange-300 border-orange-500/20'
                            }`}
                          >
                            {smsSegments} SMS
                          </span>
                        </div>

                        <div className="mt-3">
                          <p className="text-slate-300 wrap-break-word leading-relaxed whitespace-pre-wrap">
                            {previewBody}
                          </p>

                          {shouldShowReadMore && (
                            <button
                              type="button"
                              onClick={() => toggleReadMore(templateId)}
                              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
                            >
                              {isExpanded ? (
                                <>
                                  Show less
                                  <ChevronUp size={16} />
                                </>
                              ) : (
                                <>
                                  Read more
                                  <ChevronDown size={16} />
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>
                            Characters:{' '}
                            <span className={getCharacterStatusClass(bodyLength)}>
                              {bodyLength}
                            </span>
                          </span>

                          <span>
                            Segments:{' '}
                            <span className={getCharacterStatusClass(bodyLength)}>
                              {smsSegments}
                            </span>
                          </span>

                          {getTemplateDate(template) && (
                            <span>
                              Updated:{' '}
                              {new Date(
                                getTemplateDate(template),
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        {template.media_url && (
                          <p className="text-xs text-slate-400 mt-3 flex items-center gap-2 break-all">
                            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
                            {template.media_url}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateTemplate(template)}
                          disabled={isDuplicating}
                          className="text-slate-400 hover:text-purple-400 hover:bg-slate-700/50"
                          title="Duplicate template"
                        >
                          {isDuplicating ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Copy size={18} />
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTemplate(template)}
                          className="text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50"
                          title="Edit template"
                        >
                          <Edit2 size={18} />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTemplate(templateId)}
                          disabled={isDeleting}
                          className="text-slate-400 hover:text-red-400 hover:bg-slate-700/50"
                          title="Delete template"
                        >
                          {isDeleting ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}