import { JoinRoomForm } from "@/components/lobby/JoinRoomForm";
import { CardCatalogButton } from "@/components/CardCatalogButton";

export default function LobbyPage() {
  return (
    <main className="centered-page">
      <div className="sticker-page-card">
        <h1>Rejoindre une partie</h1>
        <JoinRoomForm />
        <CardCatalogButton />
      </div>
    </main>
  );
}
