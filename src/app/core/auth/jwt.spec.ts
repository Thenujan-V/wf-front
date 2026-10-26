import { tokenWith } from '../../../testing/test-tokens';
import { decodeJwtPayload, realmRoles, stringClaim } from './jwt';

describe('jwt helpers', () => {
  it('decodes a base64url payload including non-ASCII text', () => {
    const claims = decodeJwtPayload(tokenWith({ name: 'Dilhān Perera', n: 1 }));
    expect(claims).toEqual({ name: 'Dilhān Perera', n: 1 });
  });

  it('returns null for malformed tokens', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.%%%.c')).toBeNull();
    expect(decodeJwtPayload(`a.${btoa('[1,2]')}.c`)).toBeNull();
  });

  it('reads realm roles defensively', () => {
    expect(realmRoles({ realm_access: { roles: ['user', 7, 'wms-admin'] } })).toEqual(['user', 'wms-admin']);
    expect(realmRoles({ realm_access: 'nope' })).toEqual([]);
    expect(realmRoles(null)).toEqual([]);
  });

  it('reads string claims or empty string', () => {
    expect(stringClaim({ name: 'Ann' }, 'name')).toBe('Ann');
    expect(stringClaim({ name: 5 }, 'name')).toBe('');
  });
});
