/**
 * Password Utilities
 *
 * Secure password hashing and comparison using bcrypt.
 */

import bcrypt from 'bcrypt';
import { getAuthConfig } from './config';

/**
 * Hash a plaintext password
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const { bcryptRounds } = getAuthConfig();
  return bcrypt.hash(plaintext, bcryptRounds);
}

/**
 * Compare a plaintext password against a hash
 */
export async function comparePassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Validate password strength (basic rules)
 * Returns null if valid, error message if invalid
 */
export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }

  if (password.length > 128) {
    return 'Password must be less than 128 characters';
  }

  // At least one letter and one number
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  return null;
}
