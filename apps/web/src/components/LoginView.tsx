import type { User } from "@midterm/shared";

type LoginViewProps = {
  users: User[];
  onLogin: (userId: string) => void;
  loading: boolean;
};

export function LoginView({ users, onLogin, loading }: LoginViewProps) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Midterm Project</p>
        <h1>CollabWrite</h1>
        <p className="lead">
          A collaborative document editor with role-aware sharing, live presence, version history,
          and AI writing assistance.
        </p>

        <div className="user-grid">
          {users.map((user) => (
            <button
              key={user.id}
              className="user-card"
              disabled={loading}
              onClick={() => onLogin(user.id)}
              type="button"
            >
              <span className="avatar" style={{ backgroundColor: user.avatarColor }}>
                {user.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2)}
              </span>
              <strong>{user.displayName}</strong>
              <span>{user.role}</span>
              <small>{user.email}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
