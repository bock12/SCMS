import type { ChurchResource } from './types';
import { supabase } from './supabaseClient';

export async function getChurchResources(includeUnpublished = false): Promise<ChurchResource[]> {
  let query = supabase.from('church_resources').select('*').order('created_at', { ascending: false });
  if (!includeUnpublished) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ChurchResource[];
}

export async function saveChurchResource(
  resource: Omit<ChurchResource, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<ChurchResource> {
  const now = new Date().toISOString();
  const payload = { ...resource, updated_at: now };
  const query = resource.id
    ? supabase.from('church_resources').update(payload).eq('id', resource.id).select('*').single()
    : supabase.from('church_resources').insert({ ...payload, created_at: now }).select('*').single();
  const { data, error } = await query;
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error('The church resource could not be saved.');
  return saved as ChurchResource;
}

export async function deleteChurchResource(resourceId: string): Promise<void> {
  const { error } = await supabase.from('church_resources').delete().eq('id', resourceId);
  if (error) throw error;
}
