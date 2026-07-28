import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { TextInput, ErrorBanner } from '../components/ui.jsx';
import { useMutation } from '../lib/useApi.js';

export default function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });

  const { run, pending, error } = useMutation(signIn);

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await run(form.email, form.password);
    if (result.ok) navigate(location.state?.from?.pathname ?? '/', { replace: true });
  };

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthShell
      title="Sign in"
      subtitle="Pick up where your breeding records left off."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-chile-600 hover:text-chile-700">
            Register a breeding programme
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorBanner error={error} />

        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={field('email')}
        />
        <TextInput
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={field('password')}
        />

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
