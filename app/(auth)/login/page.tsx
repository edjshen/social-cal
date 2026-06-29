import AuthForm from '@/components/AuthForm';
import { login } from '@/lib/actions/auth';
import { safeNext } from '@/lib/url';
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={login} next={safeNext(next) ?? undefined} />;
}
