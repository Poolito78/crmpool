import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { messageLisible } from './claudeIA';

describe('messageLisible', () => {
  it('dit en clair qu\'il manque du crédit, pas que la clé est mauvaise', () => {
    const brut = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011C"}';
    const m = messageLisible(brut);
    expect(m).toContain('crédit Anthropic insuffisant');
    expect(m).not.toContain('{');
  });

  it('sort le message de son enveloppe JSON', () => {
    expect(messageLisible('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')).toBe('Overloaded');
  });

  it('laisse passer un message déjà lisible', () => {
    expect(messageLisible('Clé ANTHROPIC_API_KEY refusée par Anthropic.')).toBe('Clé ANTHROPIC_API_KEY refusée par Anthropic.');
  });
});
