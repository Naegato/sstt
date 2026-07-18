import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../src/components/game/Card";
import type { Card as CardType } from "@card-game/shared-types";

const mockCard: CardType = {
  id: "bombe-01",
  name: "Bombe",
  rarity: "normale",
  text: "Placez cette carte face visible devant vous, puis rejouez un tour.",
  effects: [],
};

describe("Card component", () => {
  it("affiche le nom, la rareté et le texte de la carte", () => {
    render(<Card card={mockCard} />);
    expect(screen.getByText("Bombe")).toBeDefined();
    expect(screen.getByText("Normale")).toBeDefined();
    expect(screen.getByText(/rejouez un tour/)).toBeDefined();
  });

  it("n'appelle pas onPlay quand disabled est true", () => {
    const onPlay = vi.fn();
    render(<Card card={mockCard} disabled onPlay={onPlay} />);
    screen.getByRole("button").click();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("appelle onPlay avec la carte au clic quand activé", () => {
    const onPlay = vi.fn();
    render(<Card card={mockCard} onPlay={onPlay} />);
    screen.getByRole("button").click();
    expect(onPlay).toHaveBeenCalledWith(mockCard);
  });

  it("affiche le label 'Étoile' pour une carte étoile", () => {
    render(<Card card={{ ...mockCard, rarity: "etoile" }} />);
    expect(screen.getByText("Étoile")).toBeDefined();
  });
});
