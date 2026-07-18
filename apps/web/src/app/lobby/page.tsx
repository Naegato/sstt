import { JoinRoomForm } from "@/components/lobby/JoinRoomForm";
import { getCurrentUser } from "@/lib/session";

export default async function LobbyPage() {
  const user = await getCurrentUser();

  return (
    <main className="centered-page">
      <div className="sticker-page-card">
        <h1>Rejoindre une partie</h1>
        <JoinRoomForm initialName={user?.displayName ?? null} />
      </div>
    </main>
  );
}
