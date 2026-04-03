import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@midterm/shared";
import { LoginView } from "./LoginView";

const users: User[] = [
  {
    id: "user-layla",
    email: "layla@collabwrite.dev",
    displayName: "Layla Hassan",
    role: "member",
    avatarColor: "#ff7043"
  },
  {
    id: "user-sara",
    email: "sara@collabwrite.dev",
    displayName: "Sara Adel",
    role: "admin",
    avatarColor: "#43a047"
  }
];

describe("LoginView", () => {
  it("renders seeded users and forwards the selected login", () => {
    const onLogin = vi.fn();

    render(<LoginView users={users} onLogin={onLogin} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Layla Hassan/i }));

    expect(screen.getByText("LH")).toBeInTheDocument();
    expect(screen.getByText("Sara Adel")).toBeInTheDocument();
    expect(onLogin).toHaveBeenCalledWith("user-layla");
  });

  it("disables the login cards while an authentication request is running", () => {
    render(<LoginView users={users} onLogin={vi.fn()} loading />);

    expect(screen.getByRole("button", { name: /Layla Hassan/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sara Adel/i })).toBeDisabled();
  });
});
