import type { Ministry } from './types';
import { supabase } from './supabaseClient';
import { supabaseDataClient, supabaseMemberIntegrationEnabled, supabaseAuthEnabled } from './supabaseIntegration';

function getMinistryDefinitionWriteClient(): any {
  if (!supabaseMemberIntegrationEnabled) return supabase;
  if (!supabaseAuthEnabled) {
    throw new Error('Ministry definition changes require a real Supabase Auth session.');
  }
  if (!supabaseDataClient) {
    throw new Error('Supabase is enabled but its URL or publishable key is missing.');
  }
  return supabaseDataClient;
}

export interface MinistryDefinitionInput {
  branch_id: string | null;
  name: string;
  description: string;
  category: string;
  meeting_time: string;
  type: NonNullable<Ministry['type']>;
  roles_and_responsibilities: string[];
  leader_id: string | null;
}

export async function createMinistryDefinition(input: MinistryDefinitionInput): Promise<Ministry> {
  const client = getMinistryDefinitionWriteClient();
  const { data, error } = await client.rpc('create_ministry', {
    p_branch_id: input.branch_id,
    p_name: input.name,
    p_description: input.description,
    p_category: input.category,
    p_meeting_time: input.meeting_time,
    p_type: input.type,
    p_roles_and_responsibilities: input.roles_and_responsibilities,
    p_leader_id: input.leader_id
  });
  if (error) throw error;
  if (!data) throw new Error('The ministry definition was not created.');
  return data as Ministry;
}

export async function updateMinistryDefinition(
  ministryId: string,
  input: Omit<MinistryDefinitionInput, 'branch_id'>
): Promise<Ministry> {
  const client = getMinistryDefinitionWriteClient();
  const { data, error } = await client.rpc('update_ministry', {
    p_ministry_id: ministryId,
    p_name: input.name,
    p_description: input.description,
    p_category: input.category,
    p_meeting_time: input.meeting_time,
    p_type: input.type,
    p_roles_and_responsibilities: input.roles_and_responsibilities,
    p_leader_id: input.leader_id
  });
  if (error) throw error;
  if (!data) throw new Error('The ministry definition was not updated.');
  return data as Ministry;
}

export async function archiveMinistryDefinition(ministryId: string): Promise<Ministry> {
  const client = getMinistryDefinitionWriteClient();
  const { data, error } = await client.rpc('archive_ministry', {
    p_ministry_id: ministryId
  });
  if (error) throw error;
  if (!data) throw new Error('The ministry definition was not archived.');
  return data as Ministry;
}
