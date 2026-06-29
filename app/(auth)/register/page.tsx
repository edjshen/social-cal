import AuthForm from '@/components/AuthForm';
import { register } from '@/lib/actions/auth';
import { safeNext } from '@/lib/url';
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="register" action={register} next={safeNext(next) ?? undefined} />;
}
