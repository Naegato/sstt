"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();

  const handleClick = async () => {
    await logout();
    router.refresh();
  };

  return (
    <button type="button" onClick={handleClick}>
      Se déconnecter
    </button>
  );
}
