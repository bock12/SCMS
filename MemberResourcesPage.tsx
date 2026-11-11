import React, { useEffect, useState } from 'react';
import type { ChurchResource } from './types';
import { getChurchResources } from './churchResourceService';

export function MemberResourcesPage() {
  const [resources, setResources] = useState<ChurchResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getChurchResources(false)
      .then(rows => { if (active) setResources(rows); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load church resources.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Church Library</p>
        <h1 className="text-2xl font-black text-slate-900 mt-1">Resources</h1>
        <p className="text-sm text-slate-500 mt-2">Teaching materials, documents, media and helpful links shared by church leadership.</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
      {loading ? <div className="rounded-2xl bg-white p-8 text-sm text-slate-500">Loading resources…</div> : resources.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
          <h2 className="font-bold text-slate-800">No resources published yet</h2>
          <p className="text-sm text-slate-500 mt-2">New church resources will appear here when they are shared.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {resources.map(resource => (
            <article key={resource.id} className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1 text-[10px] font-black uppercase">{resource.category}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">{resource.resource_type}</span>
              </div>
              <h2 className="font-extrabold text-slate-900 mt-4">{resource.title}</h2>
              {resource.description && <p className="text-sm text-slate-600 mt-2 flex-1">{resource.description}</p>}
              <a href={resource.resource_url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Open resource</a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
