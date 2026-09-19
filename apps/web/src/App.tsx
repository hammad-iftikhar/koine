import { signInWithGoogle, signOut, useMe } from './lib/auth'

export function App() {
  const { user, isLoading } = useMe()

  return (
    <main style={{ padding: 24 }}>
      <h1 data-testid="app-title">Koine</h1>
      {isLoading ? (
        <p className="text-fg-2">Checking your session…</p>
      ) : user ? (
        <p data-testid="signed-in">
          Signed in as {user.email}{' '}
          <button type="button" onClick={signOut} className="text-blue underline">
            Sign out
          </button>
        </p>
      ) : (
        <button
          type="button"
          data-testid="sign-in"
          onClick={() => signInWithGoogle()}
          className="rounded-full bg-blue px-5 py-3 font-semibold text-white"
        >
          Continue with Google
        </button>
      )}
    </main>
  )
}
