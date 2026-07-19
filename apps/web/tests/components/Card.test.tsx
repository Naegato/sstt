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

  it("appelle quand même onPlay quand disabled est true (visuel seulement, pas un vrai <button disabled>)", () => {
    // `disabled` ne bloque plus nativement le clic : sinon impossible de zoomer
    // pour lire une carte de sa main hors de son tour (GameBoard.handleCardClick
    // décide, selon isCardDisabled, d'ouvrir un zoom en lecture seule ou le flux
    // de confirmation normal — voir CLAUDE.md, retour utilisateur sur ce point).
    const onPlay = vi.fn();
    render(<Card card={mockCard} disabled onPlay={onPlay} />);
    screen.getByRole("button").click();
    expect(onPlay).toHaveBeenCalledWith(mockCard);
  });

  it("n'appelle pas onPlay quand onPlay n'est pas fourni (carte en lecture seule pure)", () => {
    const onPlay = vi.fn();
    render(<Card card={mockCard} disabled />);
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
