import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { TextInput, ErrorBanner } from '../components/ui.jsx';
import { useMutation } from '../lib/useApi.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    displayName: '',
    programName: '',
    handle: '',
    email: '',
    password: '',
  });

  const { run, pending, error } = useMutation(register);
  const fieldErrors = error?.fieldErrors ?? {};

  const onSubmit = async (e) => {
    e.preventDefault();
    const result = await run(form);
    if (result.ok) navigate('/', { replace: true });
  };

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthShell
      title="Register a breeding programme"
      subtitle="Your records start private. You choose what to share, and with whom."
      footer={
        <>
          Already registered?{' '}
          <Link to="/sign-in" className="font-medium text-chile-600 hover:text-chile-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Field-level messages are rendered on the inputs; this catches the rest. */}
        <ErrorBanner error={error?.details?.length ? null : error} />

        <TextInput
          label="Your name"
          required
          autoComplete="name"
          value={form.displayName}
          onChange={field('displayName')}
          error={fieldErrors.displayName}
        />
        <TextInput
          label="Programme name"
          placeholder="Ember Vine Genetics"
          hint="Optional. Shown to members you share lineage with."
          value={form.programName}
          onChange={field('programName')}
          error={fieldErrors.programName}
        />
        <TextInput
          label="Handle"
          required
          placeholder="ember-vine"
          hint="How other breeders find you when sharing. Lowercase, 3–32 characters."
          value={form.handle}
          onChange={field('handle')}
          error={fieldErrors.handle}
        />
        <TextInput
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={field('email')}
          error={fieldErrors.email}
        />
        <TextInput
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 10 characters."
          value={form.password}
          onChange={field('password')}
          error={fieldErrors.password}
        />

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
