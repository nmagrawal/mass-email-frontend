'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/apiClient';
import {
  Loader2,
  AlertCircle,
  Send,
  Zap,
  Users,
  MapPin,
  Trash2,
  Plus,
  Search,
  RefreshCw,
  X,
  CheckCircle2,
  ClipboardPaste,
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

interface Contact {
  phone: string;
  name?: string;
}

type AudienceType = 'upload' | 'city';

export function SmsCampaignComposer() {
  const [campaignName, setCampaignName] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  const [audienceType, setAudienceType] = useState<AudienceType>('upload');

  const [contacts, setContacts] = useState<Contact[]>([
    { phone: '', name: '' },
  ]);
  const [bulkInput, setBulkInput] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);

  const [city, setCity] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityList, setCityList] = useState<string[]>([]);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const templatePickerRef = useRef<HTMLDivElement | null>(null);
  const cityPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (audienceType === 'city' && cityList.length === 0 && !cityLoading) {
      fetchCities();
    }
  }, [audienceType, cityList.length, cityLoading]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        templatePickerRef.current &&
        !templatePickerRef.current.contains(target)
      ) {
        setTemplateDropdownOpen(false);
      }

      if (cityPickerRef.current && !cityPickerRef.current.contains(target)) {
        setCityDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function getTemplateId(template: Template) {
    return template._id || template.id || '';
  }

  function getSmsSegments(text: string) {
    if (!text.trim()) return 0;
    return Math.ceil(text.length / 160);
  }

  function normalizePhone(phone: string) {
    return phone.replace(/[^\d+]/g, '').trim();
  }

  function isValidPhone(phone: string) {
    const normalized = normalizePhone(phone);
    return /^\+?\d{7,15}$/.test(normalized);
  }

  function cleanCityList(rawCities: unknown[]) {
    return rawCities
      .filter((cityName): cityName is string => typeof cityName === 'string')
      .map((cityName) => cityName.trim())
      .filter(Boolean)
      .filter((cityName, index, array) => array.indexOf(cityName) === index)
      .sort((a, b) => a.localeCompare(b));
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

  async function fetchTemplates() {
    try {
      setTemplatesLoading(true);
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
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function fetchCities() {
    try {
      setCityLoading(true);
      setError(null);

      const res = await fetch('/api/voters?distinct=city');

      if (!res.ok) {
        throw new Error('Failed to fetch cities');
      }

      const data = await res.json();

      const rawCities = Array.isArray(data?.cities)
        ? data.cities
        : Array.isArray(data)
          ? data
          : [];

      const cleanCities = cleanCityList(rawCities);

      setCityList(cleanCities);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch cities');
    } finally {
      setCityLoading(false);
    }
  }

  function addContact() {
    const lastContact = contacts[contacts.length - 1];

    if (
      contacts.length === 0 ||
      lastContact.phone.trim() ||
      lastContact.name?.trim()
    ) {
      setContacts([...contacts, { phone: '', name: '' }]);
    }
  }

  function removeContact(index: number) {
    const updatedContacts = contacts.filter((_, i) => i !== index);

    setContacts(
      updatedContacts.length === 0
        ? [{ phone: '', name: '' }]
        : updatedContacts,
    );
  }

  function updateContact(index: number, field: 'phone' | 'name', value: string) {
    const newContacts = [...contacts];

    newContacts[index] = {
      ...newContacts[index],
      [field]: value,
    };

    setContacts(newContacts);
  }

  function removeAllContacts() {
    setContacts([{ phone: '', name: '' }]);
  }

  function removeDuplicateContacts() {
    const seen = new Set<string>();
    const uniqueContacts: Contact[] = [];

    contacts.forEach((contact) => {
      const phone = normalizePhone(contact.phone);

      if (!phone || seen.has(phone)) return;

      seen.add(phone);
      uniqueContacts.push({
        phone,
        name: contact.name?.trim() || '',
      });
    });

    setContacts(
      uniqueContacts.length > 0 ? uniqueContacts : [{ phone: '', name: '' }],
    );
  }

  function importBulkContacts() {
    const lines = bulkInput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const importedContacts: Contact[] = [];

    lines.forEach((line) => {
      const parts = line.split(',');
      const phone = normalizePhone(parts[0] || '');
      const name = parts.slice(1).join(',').trim();

      if (phone) {
        importedContacts.push({
          phone,
          name: name || '',
        });
      }
    });

    if (importedContacts.length === 0) {
      setError('No valid contacts found in bulk input');
      return;
    }

    const existingContacts = contacts.filter((contact) =>
      contact.phone.trim(),
    );

    const merged = [...existingContacts, ...importedContacts];

    const seen = new Set<string>();
    const uniqueContacts: Contact[] = [];

    merged.forEach((contact) => {
      const phone = normalizePhone(contact.phone);

      if (!phone || seen.has(phone)) return;

      seen.add(phone);
      uniqueContacts.push({
        phone,
        name: contact.name?.trim() || '',
      });
    });

    setContacts(uniqueContacts);
    setBulkInput('');
    setShowBulkInput(false);
    setError(null);
  }

  function selectTemplate(template: Template) {
    const id = getTemplateId(template);

    if (!id) {
      setError('Template ID is missing');
      return;
    }

    setSelectedTemplate(id);
    setTemplateSearch(template.name || '');
    setTemplateDropdownOpen(false);
  }

  function clearSelectedTemplate() {
    setSelectedTemplate('');
    setTemplateSearch('');
    setTemplateDropdownOpen(false);
  }

  function selectCity(cityName: string) {
    setCity(cityName);
    setCitySearch(cityName);
    setCityDropdownOpen(false);
  }

  function clearSelectedCity() {
    setCity('');
    setCitySearch('');
    setCityDropdownOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!campaignName.trim()) {
      setError('Campaign name is required');
      return;
    }

    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    if (audienceType === 'upload') {
      if (!contacts.some((contact) => contact.phone.trim())) {
        setError('Please add at least one contact');
        return;
      }

      const invalidContacts = contacts.filter(
        (contact) => contact.phone.trim() && !isValidPhone(contact.phone),
      );

      if (invalidContacts.length > 0) {
        setError('Please fix invalid phone numbers before launching campaign');
        return;
      }
    }

    if (audienceType === 'city' && !city) {
      setError('Please select a city');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const cleanedContacts = contacts
        .filter((contact) => contact.phone.trim())
        .map((contact) => ({
          phone: normalizePhone(contact.phone),
          name: contact.name?.trim() || undefined,
        }));

      const payload = {
        campaign_name: campaignName.trim(),
        template_id: selectedTemplate,
        audience:
          audienceType === 'upload'
            ? {
                contacts: cleanedContacts,
              }
            : {
                city,
              },
      };

      const res = await apiFetch('/api/sms/campaign/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = await getErrorMessage(res, 'Failed to launch campaign');
        throw new Error(message);
      }

      setSuccess('Campaign launched successfully! 🎉');
      setCampaignName('');
      setSelectedTemplate('');
      setTemplateSearch('');
      setContacts([{ phone: '', name: '' }]);
      setBulkInput('');
      setShowBulkInput(false);
      setCity('');
      setCitySearch('');

      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to launch campaign');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTemplateData = useMemo(() => {
    return templates.find(
      (template) => getTemplateId(template) === selectedTemplate,
    );
  }, [templates, selectedTemplate]);

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();

    if (!query || selectedTemplateData?.name === templateSearch) {
      return templates;
    }

    return templates.filter((template) => {
      const name =
        typeof template.name === 'string' ? template.name.toLowerCase() : '';

      const body =
        typeof template.body === 'string' ? template.body.toLowerCase() : '';

      return name.includes(query) || body.includes(query);
    });
  }, [templates, templateSearch, selectedTemplateData]);

  const filteredCities = useMemo(() => {
    const query = citySearch.trim().toLowerCase();

    const cleanCities = cityList
      .filter((cityName): cityName is string => typeof cityName === 'string')
      .map((cityName) => cityName.trim())
      .filter(Boolean);

    if (!query || city === citySearch) {
      return cleanCities;
    }

    return cleanCities.filter((cityName) =>
      cityName.toLowerCase().includes(query),
    );
  }, [cityList, citySearch, city]);

  const validContacts = useMemo(() => {
    return contacts.filter(
      (contact) => contact.phone.trim() && isValidPhone(contact.phone),
    );
  }, [contacts]);

  const invalidContactCount = useMemo(() => {
    return contacts.filter(
      (contact) => contact.phone.trim() && !isValidPhone(contact.phone),
    ).length;
  }, [contacts]);

  const uniqueContactCount = useMemo(() => {
    const uniquePhones = new Set(
      validContacts.map((contact) => normalizePhone(contact.phone)),
    );

    return uniquePhones.size;
  }, [validContacts]);

  const duplicateContactCount = validContacts.length - uniqueContactCount;

  const selectedTemplateBody = selectedTemplateData?.body || '';
  const selectedTemplateSegments = getSmsSegments(selectedTemplateBody);

  const canSubmit =
    Boolean(campaignName.trim()) &&
    Boolean(selectedTemplate) &&
    !submitting &&
    (audienceType === 'city'
      ? Boolean(city)
      : validContacts.length > 0 && invalidContactCount === 0);

  return (
    <div className="w-full min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="text-purple-400" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-white">
                Launch SMS Campaign
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Create and send campaigns with searchable templates and smarter
                audience targeting.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={fetchTemplates}
            disabled={templatesLoading}
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
          >
            {templatesLoading ? (
              <Loader2 size={18} className="mr-2 animate-spin" />
            ) : (
              <RefreshCw size={18} className="mr-2" />
            )}
            Refresh Templates
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-5 bg-red-500/10 text-red-300 rounded-xl border border-red-500/30 flex items-start gap-4">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-5 bg-emerald-500/10 text-emerald-300 rounded-xl border border-emerald-500/30 flex items-start gap-4">
            <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
            <p className="font-semibold">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6">
            <label className="text-sm font-bold text-slate-200 block mb-3 uppercase tracking-wide">
              Campaign Name
            </label>
            <Input
              placeholder="Enter campaign name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg h-12 focus:ring-2 focus:ring-purple-500 text-base"
              required
            />
          </div>

          <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <label className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                Search and Select Template
              </label>

              <span className="text-xs text-slate-400">
                {templates.length} available
              </span>
            </div>

            <div ref={templatePickerRef} className="relative">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <Input
                  value={templateSearch}
                  onChange={(e) => {
                    setTemplateSearch(e.target.value);
                    setSelectedTemplate('');
                    setTemplateDropdownOpen(true);
                  }}
                  onFocus={() => setTemplateDropdownOpen(true)}
                  placeholder={
                    templatesLoading
                      ? 'Loading templates...'
                      : 'Search template by name or message body'
                  }
                  disabled={templatesLoading}
                  className="pl-10 pr-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg h-12 focus:ring-2 focus:ring-purple-500"
                />

                {templateSearch && (
                  <button
                    type="button"
                    onClick={clearSelectedTemplate}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {templateDropdownOpen && (
                <div className="absolute z-30 mt-2 w-full max-h-80 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                  {templatesLoading ? (
                    <div className="p-4 text-slate-300 flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Loading templates...
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="p-4 text-slate-400">
                      No template found. Try another keyword.
                    </div>
                  ) : (
                    filteredTemplates.map((template) => {
                      const templateId = getTemplateId(template);
                      const isSelected = templateId === selectedTemplate;
                      const segments = getSmsSegments(template.body || '');

                      return (
                        <button
                          key={templateId}
                          type="button"
                          onClick={() => selectTemplate(template)}
                          className={`w-full text-left p-4 border-b border-slate-800 hover:bg-slate-800/80 transition-colors ${
                            isSelected ? 'bg-purple-500/10' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-white truncate">
                                {template.name}
                              </p>
                              <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                                {template.body}
                              </p>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {isSelected && (
                                <CheckCircle2
                                  size={16}
                                  className="text-purple-300"
                                />
                              )}
                              <span className="text-xs text-slate-500">
                                {template.body?.length || 0} chars
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  segments <= 1
                                    ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
                                    : 'text-orange-300 border-orange-500/30 bg-orange-500/10'
                                }`}
                              >
                                {segments} SMS
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selectedTemplateData && (
              <div className="mt-4 p-4 bg-slate-950/60 border border-slate-700 rounded-xl">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs text-slate-400 font-semibold">
                    SELECTED TEMPLATE PREVIEW
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">
                      {selectedTemplateBody.length} characters
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full border ${
                        selectedTemplateSegments <= 1
                          ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'
                          : 'text-orange-300 border-orange-500/30 bg-orange-500/10'
                      }`}
                    >
                      {selectedTemplateSegments} SMS
                    </span>
                  </div>
                </div>

                <p className="text-white font-semibold mb-2">
                  {selectedTemplateData.name}
                </p>

                <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">
                  {selectedTemplateData.body}
                </p>
              </div>
            )}
          </div>

          <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6">
            <label className="text-sm font-bold text-slate-200 block mb-4 uppercase tracking-wide">
              Select Audience
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAudienceType('upload')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  audienceType === 'upload'
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-200'
                    : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Users size={20} />
                  <div>
                    <p className="font-semibold">Upload Contacts</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Add phone numbers manually or bulk paste.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAudienceType('city')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  audienceType === 'city'
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-200'
                    : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MapPin size={20} />
                  <div>
                    <p className="font-semibold">Target by City</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Search and select a city from voter data.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {audienceType === 'upload' ? (
            <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <label className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Add Contacts
                  </label>
                  <p className="text-xs text-slate-400 mt-1">
                    Use format: phone, name. Example: +919999999999, Chirag
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => setShowBulkInput((value) => !value)}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                  >
                    <ClipboardPaste size={16} className="mr-2" />
                    Bulk Paste
                  </Button>

                  <Button
                    type="button"
                    onClick={removeDuplicateContacts}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                  >
                    Remove Duplicates
                  </Button>

                  <Button
                    type="button"
                    onClick={addContact}
                    className="bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-lg text-sm font-semibold transition-all hover:shadow-lg hover:shadow-emerald-500/50"
                  >
                    <Plus size={16} className="mr-2" />
                    Add Contact
                  </Button>
                </div>
              </div>

              {showBulkInput && (
                <div className="mb-4 p-4 bg-slate-950/60 border border-slate-700 rounded-xl">
                  <Textarea
                    placeholder={`One contact per line:\n+919999999999, Chirag\n+918888888888, Rahul`}
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    className="bg-slate-800/70 border-slate-600 text-white placeholder:text-slate-500 rounded-lg min-h-32"
                  />

                  <div className="flex gap-2 mt-3">
                    <Button
                      type="button"
                      onClick={importBulkContacts}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Import Contacts
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setBulkInput('');
                        setShowBulkInput(false);
                      }}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
                {contacts.map((contact, index) => {
                  const hasPhone = contact.phone.trim();
                  const invalidPhone =
                    hasPhone && !isValidPhone(contact.phone);

                  return (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-start"
                    >
                      <div>
                        <Input
                          type="tel"
                          placeholder="Phone number"
                          value={contact.phone}
                          onChange={(e) =>
                            updateContact(index, 'phone', e.target.value)
                          }
                          className={`bg-slate-700/50 text-white placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-purple-500 ${
                            invalidPhone
                              ? 'border-red-500'
                              : 'border-slate-600'
                          }`}
                        />
                        {invalidPhone && (
                          <p className="text-xs text-red-300 mt-1">
                            Invalid phone number
                          </p>
                        )}
                      </div>

                      <Input
                        placeholder="Name optional"
                        value={contact.name || ''}
                        onChange={(e) =>
                          updateContact(index, 'name', e.target.value)
                        }
                        className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />

                      <Button
                        type="button"
                        onClick={() => removeContact(index)}
                        disabled={contacts.length === 1}
                        variant="ghost"
                        className="text-slate-400 hover:text-red-400 hover:bg-slate-700/50"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex flex-wrap gap-3">
                  <span>
                    Valid:{' '}
                    <span className="text-emerald-300 font-semibold">
                      {validContacts.length}
                    </span>
                  </span>

                  <span>
                    Unique:{' '}
                    <span className="text-cyan-300 font-semibold">
                      {uniqueContactCount}
                    </span>
                  </span>

                  <span>
                    Invalid:{' '}
                    <span className="text-red-300 font-semibold">
                      {invalidContactCount}
                    </span>
                  </span>

                  <span>
                    Duplicates:{' '}
                    <span className="text-orange-300 font-semibold">
                      {duplicateContactCount}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={removeAllContacts}
                  className="text-red-300 hover:text-red-200"
                >
                  Clear all
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-linear-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <label className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                  Search and Select City
                </label>

                <Button
                  type="button"
                  onClick={fetchCities}
                  disabled={cityLoading}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700/50"
                >
                  {cityLoading ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <RefreshCw size={16} className="mr-2" />
                  )}
                  Refresh
                </Button>
              </div>

              <div ref={cityPickerRef} className="relative">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <Input
                    value={citySearch}
                    onChange={(e) => {
                      setCitySearch(e.target.value);
                      setCity('');
                      setCityDropdownOpen(true);
                    }}
                    onFocus={() => setCityDropdownOpen(true)}
                    placeholder={cityLoading ? 'Loading cities...' : 'Search city'}
                    disabled={cityLoading}
                    className="pl-10 pr-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 rounded-lg h-12 focus:ring-2 focus:ring-purple-500"
                  />

                  {citySearch && (
                    <button
                      type="button"
                      onClick={clearSelectedCity}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {cityDropdownOpen && (
                  <div className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                    {cityLoading ? (
                      <div className="p-4 text-slate-300 flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        Loading cities...
                      </div>
                    ) : filteredCities.length === 0 ? (
                      <div className="p-4 text-slate-400">No city found.</div>
                    ) : (
                      filteredCities.map((cityName) => {
                        const isSelected = cityName === city;

                        return (
                          <button
                            key={cityName}
                            type="button"
                            onClick={() => selectCity(cityName)}
                            className={`w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800/80 transition-colors ${
                              isSelected ? 'bg-purple-500/10' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-white">{cityName}</span>
                              {isSelected && (
                                <CheckCircle2
                                  size={16}
                                  className="text-purple-300"
                                />
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-xs text-blue-300 font-semibold">CAMPAIGN</p>
              <p className="text-white font-bold text-lg mt-1 truncate">
                {campaignName || 'Not named'}
              </p>
            </div>

            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <p className="text-xs text-purple-300 font-semibold">TEMPLATE</p>
              <p className="text-white font-bold text-lg mt-1 truncate">
                {selectedTemplateData?.name || 'Not selected'}
              </p>
              {selectedTemplateData && (
                <p className="text-xs text-slate-400 mt-1">
                  {selectedTemplateBody.length} chars ·{' '}
                  {selectedTemplateSegments} SMS
                </p>
              )}
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
              <p className="text-xs text-cyan-300 font-semibold">AUDIENCE</p>
              <p className="text-white font-bold text-lg mt-1 truncate">
                {audienceType === 'upload'
                  ? `${validContacts.length} valid contacts`
                  : city || 'Not selected'}
              </p>
              {audienceType === 'upload' && (
                <p className="text-xs text-slate-400 mt-1">
                  {uniqueContactCount} unique · {invalidContactCount} invalid
                </p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-linear-to-r from-purple-500 via-pink-500 to-purple-500 hover:from-purple-600 hover:via-pink-600 hover:to-purple-600 text-white h-14 rounded-xl font-bold text-base transition-all duration-300 hover:shadow-2xl hover:shadow-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={20} className="mr-2 animate-spin" />
                Launching Campaign...
              </>
            ) : (
              <>
                <Send size={20} className="mr-2" />
                Launch Campaign
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}