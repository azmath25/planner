import { authClient } from './client';

export const API_URL = 'https://br-shiny-king-b9np2anx-dayframeapi.compute.c-7.eu-central-1.aws.neon.tech';

export interface GeneralWorkspace {
  id: string;
  name: string;
  kind: 'general';
  createdAt: string;
}

export async function loadGeneralWorkspace(signal?: AbortSignal): Promise<GeneralWorkspace> {
  const { data, error } = await authClient.token();
  if (error || !data?.token) throw new Error('Your session expired. Please sign in again.');
  const response = await fetch(`${API_URL}/v1/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${data.token}` },
    cache: 'no-store',
    signal,
  });
  if (response.status === 401) throw new Error('Your session expired. Please sign in again.');
  if (!response.ok) throw new Error('Your workspace is temporarily unavailable. Please retry.');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('generalWorkspace' in payload)) {
    throw new Error('Unexpected workspace response.');
  }
  const row = payload.generalWorkspace;
  if (!row || typeof row !== 'object' || !('kind' in row) || row.kind !== 'general' ||
      !('name' in row) || row.name !== 'General' || !('id' in row) || typeof row.id !== 'string') {
    throw new Error('General workspace could not be verified.');
  }
  return row as GeneralWorkspace;
}
