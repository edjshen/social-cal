export const SUPERADMIN_EMAIL = 'junting.mp3@gmail.com';

export type Aal = 'aal1' | 'aal2';

// Pure, IO-free privilege decision. Throws 'FORBIDDEN' unless the caller is a
// signed-in (userId), MFA-elevated (aal2), platform admin. This is the single
// rule; the IO wrapper requireSuperadmin() (Task 3) feeds it real values.
export function assertSuperadmin(input: {
  userId: string | undefined;
  aal: Aal | undefined;
  isAdmin: boolean;
}): asserts input is { userId: string; aal: 'aal2'; isAdmin: true } {
  if (!input.userId || input.aal !== 'aal2' || !input.isAdmin) {
    throw new Error('FORBIDDEN');
  }
}
