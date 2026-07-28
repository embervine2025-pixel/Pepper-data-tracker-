import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMutation } from '../lib/useApi.js';
import {
  PageHeader,
  ErrorBanner,
  TextInput,
  TextArea,
  Select,
  Checkbox,
} from '../components/ui.jsx';
import { VISIBILITY_LABELS, VISIBILITY_HELP, optionsOf } from '../lib/format.js';

export default function Settings() {
  const { user, updateProfile } = useAuth();

  const [profile, setProfile] = useState({
    displayName: user.displayName ?? '',
    programName: user.programName ?? '',
    bio: user.bio ?? '',
    defaultVisibility: user.defaultVisibility ?? 'private',
    discoverable: user.discoverable ?? true,
  });
  const [profileSaved, setProfileSaved] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordSaved, setPasswordSaved] = useState(false);

  const saveProfile = useMutation(updateProfile);
  const changePassword = useMutation((body) => api.post('/auth/change-password', body));

  const setField = (key) => (e) => {
    setProfileSaved(false);
    setProfile((p) => ({
      ...p,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));
  };

  const onProfileSubmit = async (e) => {
    e.preventDefault();
    const result = await saveProfile.run({
      displayName: profile.displayName.trim(),
      programName: profile.programName.trim() || null,
      bio: profile.bio.trim() || null,
      defaultVisibility: profile.defaultVisibility,
      discoverable: profile.discoverable,
    });
    if (result.ok) setProfileSaved(true);
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    const result = await changePassword.run(passwords);
    if (result.ok) {
      setPasswordSaved(true);
      setPasswords({ currentPassword: '', newPassword: '' });
    }
  };

  return (
    <>
      <PageHeader title="Account settings" subtitle={`Signed in as @${user.handle}`} />

      <div className="max-w-2xl space-y-6">
        <form onSubmit={onProfileSubmit} className="card p-5" noValidate>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Your programme
          </h2>

          <div className="mt-4 space-y-4">
            <ErrorBanner error={saveProfile.error} />

            <TextInput
              label="Display name"
              required
              value={profile.displayName}
              onChange={setField('displayName')}
              error={saveProfile.error?.fieldErrors?.displayName}
            />
            <TextInput
              label="Programme name"
              placeholder="Ember Vine Genetics"
              value={profile.programName}
              onChange={setField('programName')}
            />
            <TextArea
              label="About your work"
              rows={3}
              placeholder="What you are selecting for."
              value={profile.bio}
              onChange={setField('bio')}
            />

            <Select
              label="Default visibility for new plants"
              value={profile.defaultVisibility}
              onChange={setField('defaultVisibility')}
              options={optionsOf(VISIBILITY_LABELS)}
              hint={VISIBILITY_HELP[profile.defaultVisibility]}
            />

            <Checkbox
              label="Listed in the member directory"
              hint="Turn this off and other breeders can only find you if you have already shared something with them."
              checked={profile.discoverable}
              onChange={setField('discoverable')}
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saveProfile.pending}>
              {saveProfile.pending ? 'Saving…' : 'Save changes'}
            </button>
            {profileSaved && <span className="text-sm text-leaf-700">Saved</span>}
          </div>
        </form>

        <form onSubmit={onPasswordSubmit} className="card p-5" noValidate>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Password</h2>

          <div className="mt-4 space-y-4">
            <ErrorBanner error={changePassword.error} />

            <TextInput
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => {
                setPasswordSaved(false);
                setPasswords((p) => ({ ...p, currentPassword: e.target.value }));
              }}
            />
            <TextInput
              label="New password"
              type="password"
              required
              autoComplete="new-password"
              hint="At least 10 characters."
              value={passwords.newPassword}
              onChange={(e) => {
                setPasswordSaved(false);
                setPasswords((p) => ({ ...p, newPassword: e.target.value }));
              }}
              error={changePassword.error?.fieldErrors?.newPassword}
            />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={changePassword.pending}>
              {changePassword.pending ? 'Updating…' : 'Change password'}
            </button>
            {passwordSaved && <span className="text-sm text-leaf-700">Password updated</span>}
          </div>
        </form>

        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            How privacy works here
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-ink">Private</dt>
              <dd className="text-ink-muted">{VISIBILITY_HELP.private}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Members</dt>
              <dd className="text-ink-muted">{VISIBILITY_HELP.community}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Public</dt>
              <dd className="text-ink-muted">{VISIBILITY_HELP.public}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-faint">
            Individual shares add access on top of this baseline — they never take it away. A share
            you grant can only ever cover plants you own, and it can be revoked at any time.
          </p>
        </div>
      </div>
    </>
  );
}
