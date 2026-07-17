import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { clearAuthSession, getAuthToken, getCurrentUser, saveAuthSession } from "@/lib/custom-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const token = getAuthToken();
    const storedUser = getCurrentUser();
    if (!token || !storedUser) throw redirect({ to: "/auth" });

    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      clearAuthSession();
      throw redirect({ to: "/auth" });
    }

    const session = await response.json();
    const user = {
      id: session.userId,
      email: session.email ?? storedUser.email,
      nick: session.nick ?? storedUser.nick,
      status: session.status ?? "pendente",
    };
    saveAuthSession(token, user);
    return { user };
  },
  component: () => <Outlet />,
});
