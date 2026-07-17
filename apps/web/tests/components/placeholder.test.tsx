import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "../../src/app/page";

describe("HomePage", () => {
  it("renders the landing title", () => {
    render(<HomePage />);
    expect(screen.getByText(/Personne n'a testé ce truc/)).toBeDefined();
  });
});
