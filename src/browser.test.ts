import { describe, it, expect } from 'vitest';
import { verifyErrorMessage } from './browser.js';

// NH219 n3: an unverifiable dead-key list is an availability failure, so the user is told to
// try again in a moment, as for a release outage, not that sign-in failed.
describe('verifyErrorMessage', () => {
  it.each(['release_unavailable', 'key_list_unverified'])('%s reads as temporarily unavailable', (error) => {
    expect(verifyErrorMessage(error)).toBe('AltimistID is temporarily unavailable. Try again in a moment.');
  });

  it('an unknown error reads as a generic failure', () => {
    expect(verifyErrorMessage('something_else')).toBe('Sign-in could not be completed. Try again.');
  });
});
