import type { DocumentSignatory, SignatureField, User } from '../types';

/**
 * Matches a DocumentSignatory against a logged-in User by real Auth UUID,
 * deterministic preset ID (`preset:<username>`), email, or username.
 * This allows pre-authorized regional accounts to be designated as signatories
 * before they have ever logged in, and still match seamlessly once they sign in.
 */
export function isSignatoryForUser(
  signatory: Partial<DocumentSignatory> | undefined | null,
  user: Partial<User> | undefined | null
): boolean {
  if (!signatory || !user) return false;

  if (user.id && signatory.userId === user.id) return true;

  const userUsername = (user.username || '').trim().toLowerCase();
  if (userUsername && signatory.userId === `preset:${userUsername}`) return true;

  const userEmail = (user.email || '').trim().toLowerCase();
  const sigEmail = (signatory.user?.email || '').trim().toLowerCase();
  if (userEmail && sigEmail && userEmail === sigEmail) return true;

  const sigUsername = (signatory.user?.username || '').trim().toLowerCase();
  if (userUsername && sigUsername && userUsername === sigUsername) return true;

  return false;
}

/**
 * Matches a SignatureField against a logged-in User by real Auth UUID or preset username ID.
 */
export function isFieldForUser(
  field: Partial<SignatureField> | undefined | null,
  user: Partial<User> | undefined | null
): boolean {
  if (!field || !user) return false;

  if (user.id && field.userId === user.id) return true;

  const userUsername = (user.username || '').trim().toLowerCase();
  if (userUsername) {
    if (field.userId === `preset:${userUsername}`) return true;
    if (field.signatoryId === `signtry-preset:${userUsername}`) return true;
  }

  return false;
}
