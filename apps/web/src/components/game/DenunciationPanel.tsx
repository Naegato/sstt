"use client";

import { useState } from "react";
import type { Player, PlayerId } from "@card-game/shared-types";

/**
 * Cartes manuelles "règle en vigueur" (posées devant un joueur, élimination en
 * cas d'infraction) — seules celles-ci ouvrent un bouton de dénonciation, et
 * seulement tant qu'elles sont réellement en jeu (voir CLAUDE.md : la
 * dénonciation ne sert à rien à afficher s'il n'y a rien à dénoncer). Liste
 * fermée volontairement (pas de détection automatique par texte) — cohérent
 * avec le reste du moteur qui n'invente jamais de règle à partir du texte brut.
 */
const DENUNCIATION_RULES: Record<string, string> = {
  Moi: "a dit « je », « moi » ou « mon/ma/m’ »",
  Toi: "a dit « tu/toi/t’ », « ton/ta » ou « le tien/la tienne »",
  "Ils/Elles": "a dit « ils/elles » ou « leur/leurs »",
  "Comic Sans MS": "n’a pas dit « J’adore le Comic Sans MS » avant de jouer une carte",
  "Titre de noblesse": "a tutoyé au lieu de vouvoyer",
  Zombies: "n’a pas dit « AAAH ! Des zombies ! » à son tour (et n’a pas de banane)",
  "Index réflexe": "a pointé du doigt un joueur ou une carte",
  "Génération Y": "a enfreint l’interdiction choisie (rire, téléphone, ou « du coup »)",
};

/**
 * Cartes "réflexe instantané" : l'infraction se constate au moment même où la
 * carte est jouée, pas plusieurs tours après — contrairement aux règles
 * permanentes (Moi, Toi, Zombies...) qui restent dénonçables tant qu'elles sont
 * en jeu. Doit rester synchronisée avec `REFLEX_CARD_NAMES` côté moteur
 * (`apps/server/src/engine/cards.ts`).
 */
const REFLEX_CARD_NAMES = new Set(["Index réflexe"]);

type ActiveRuleCard = {
  cardId: string;
  cardName: string;
  reason: string;
  holderId: PlayerId;
  holderName: string;
};

type DenunciationPanelProps = {
  players: Player[];
  selfId: PlayerId | null;
  openReflexCardId: string | null;
  onDenounce: (targetId: PlayerId, reason: string) => void;
};

/**
 * Une carte "règle" identique peut être posée plusieurs fois (plusieurs
 * exemplaires) : une entrée par carte physique, pas par nom. Les cartes
 * réflexe instantané (voir `REFLEX_CARD_NAMES`) ne sont incluses que tant
 * qu'elles sont la fenêtre ouverte côté moteur (`GameState.openReflexCardId`) —
 * fermée dès la fin du tour où elles ont été jouées.
 */
function collectActiveRuleCards(players: Player[], openReflexCardId: string | null): ActiveRuleCard[] {
  return players.flatMap((p) =>
    p.playedCards
      .filter((c) => {
        if (!DENUNCIATION_RULES[c.name] || c.effects.length !== 0) return false;
        if (REFLEX_CARD_NAMES.has(c.name)) return c.id === openReflexCardId;
        return true;
      })
      .map((c) => ({
        cardId: c.id,
        cardName: c.name,
        reason: DENUNCIATION_RULES[c.name]!,
        holderId: p.id,
        holderName: p.name,
      })),
  );
}

export function DenunciationPanel({ players, selfId, openReflexCardId, onDenounce }: DenunciationPanelProps) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");

  const activeRuleCards = collectActiveRuleCards(players, openReflexCardId);
  if (activeRuleCards.length === 0) return null;

  // L'auto-dénonciation est permise : on ne s'exclut plus soi-même de la liste des cibles.
  const eligibleTargets = players.filter((p) => !p.isEliminated);

  return (
    <div className="game-board__denounce">
      <h2>Dénoncer une carte en jeu</h2>
      <div className="denounce-list">
        {activeRuleCards.map((rule) => {
          const isOpen = openCardId === rule.cardId;
          return (
            <div key={rule.cardId} className="denounce-card">
              <button
                type="button"
                className="btn-sticker"
                onClick={() => {
                  setOpenCardId(isOpen ? null : rule.cardId);
                  setTargetId("");
                }}
              >
                🚨 {rule.cardName} <span className="denounce-card__holder">({rule.holderName})</span>
              </button>

              {isOpen && (
                <div className="denounce-card__form">
                  <p className="denounce-card__reason">{rule.reason}</p>
                  <select className="input-sticker" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">Qui a enfreint la règle ?</option>
                    {eligibleTargets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.id === selfId ? " (moi)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-sticker"
                    disabled={!targetId}
                    onClick={() => {
                      onDenounce(targetId, `« ${rule.cardName} » : ${rule.reason}`);
                      setOpenCardId(null);
                      setTargetId("");
                    }}
                  >
                    Dénoncer
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
