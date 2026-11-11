import React, { useEffect, useState } from 'react';
import type { ChurchResource, ChurchResourceStatus, ChurchResourceType, ChurchResourceVisibility, Profile } from './types';
import { deleteChurchResource, getChurchResources, saveChurchResource } from './churchResourceService';

const emptyForm = {
  title: '',
  description: '',
  category: 'General',
  resource_type: 'document' as ChurchResourceType,
  resource_url: '',
  visibility: 'members_only' as ChurchResourceVisibility,
  status: 'draft' as ChurchResourceStatus
};

export function ResourcesAdminTab({ profile }: { profile: Profile }) {
  const [resources, setResources] = useState<ChurchResource[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setResources(await getChurchResources(true));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load church resources.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.resource_url.trim()) {
      setError('Enter a resource title and a valid resource URL.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveChurchResource({ ...form, title: form.title.trim(), resource_url: form.resource_url.trim(), description: form.description.trim(), created_by: profile.id });
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the resource.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (resource: ChurchResource, status: ChurchResourceStatus) => {
    try {
      await saveChurchResource({ ...resource, status });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update resource status.');
    }
  };

  const removeResource = async (resourceId: string) => {
    if (!window.confirm('Delete this resource?')) return;
    try {
      await deleteChurchResource(resourceId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the resource.');
    }
  };

  return (
    <section className="space-y-6">
      <header className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Church Resources</p>
        <h2 className="text-2xl font-black text-slate-900 mt-1">Resource Library</h2>
        <p className="text-sm text-slate-500 mt-2">Publish trusted documents, teaching media and useful links for the congregation.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={handleSave} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
        <h3 className="font-extrabold text-slate-900">Add a resource</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-bold text-slate-600">Title
            <input value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" required />
          </label>
          <label className="text-xs font-bold text-slate-600">Category
            <input value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Resource URL
            <input type="url" value={form.resource_url} onChange={e => setForm(v => ({ ...v, resource_url: e.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" required />
          </label>
          <label className="text-xs font-bold text-slate-600">Resource type
            <select value={form.resource_type} onChange={e => setForm(v => ({ ...v, resource_type: e.target.value as ChurchResourceType }))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
              <option value="document">Document</option><option value="video">Video</option><option value="audio">Audio</option><option value="image">Image</option><option value="link">External link</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Visibility
            <select value={form.visibility} onChange={e => setForm(v => ({ ...v, visibility: e.target.value as ChurchResourceVisibility }))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
              <option value="members_only">Members only</option><option value="public">Public</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Initial status
            <select value={form.status} onChange={e => setForm(v => ({ ...v, status: e.target.value as ChurchResourceStatus }))} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">
              <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-bold text-slate-600">Description
          <textarea value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
        </label>
        <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save resource'}</button>
      </form>

      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold text-slate-900">Library items</h3><span className="text-xs text-slate-500">{resources.length} resources</span></div>
        {loading ? <p className="py-8 text-sm text-slate-500">Loading resources…</p> : resources.length === 0 ? <p className="py-8 text-sm text-slate-500">No resources have been added yet.</p> : (
          <div className="mt-4 divide-y divide-slate-100">
            {resources.map(resource => (
              <article key={resource.id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900">{resource.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">{resource.category} · {resource.resource_type} · {resource.visibility.replace('_', ' ')}</p>
                  {resource.description && <p className="text-sm text-slate-600 mt-1">{resource.description}</p>}
                  <a href={resource.resource_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 underline break-all">{resource.resource_url}</a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select aria-label={`Status for ${resource.title}`} value={resource.status} onChange={e => void updateStatus(resource, e.target.value as ChurchResourceStatus)} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                  </select>
                  <button type="button" onClick={() => void removeResource(resource.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
