/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { AuthUser, Role } from './lib/auth/types';

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
      role: Role | null;
      sessionToken: string | null;
    }
  }
}

export {};
