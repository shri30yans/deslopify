import ts from "typescript";
import { lineOf, parseTs } from "../codemap/extractTs.js";
import type { RawFinding, Rule } from "./types.js";

const classNameOf = (sf: ts.SourceFile, el: ts.JsxOpeningLikeElement): string => {
  const attr = el.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "className");
  return attr && ts.isJsxAttribute(attr) && attr.initializer ? attr.initializer.getText(sf) : "";
};

/** A "card" here is a rounded, padded box with a border or shadow. */
const isCard = (cls: string): boolean => /\brounded(-\w+)?\b/.test(cls) && /\b(border|shadow|ring)(-\w+)?\b/.test(cls) && /\bp[xy]?-\d/.test(cls);

export const nestedCards: Rule = {
  id: "DS-NESTED-CARD",
  phase: "write",
  instruction: "Group with spacing and dividers; never put a card inside a card.",
  why: "Nested boxes flatten the hierarchy and are a classic generated-UI pattern.",
  langs: ["tsx", "jsx"],
  defaultLevel: "warn",
  check(file) {
    const sf = parseTs(file);
    const out: RawFinding[] = [];
    const visit = (n: ts.Node, insideCard: boolean): void => {
      let inside = insideCard;
      const opening = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
      if (opening && isCard(classNameOf(sf, opening))) {
        if (insideCard) out.push({ line: lineOf(sf, n), message: "Card nested inside another card.", fix: "Remove the inner border/shadow; separate with spacing or a divider." });
        inside = true;
      }
      n.forEachChild((c) => visit(c, inside));
    };
    visit(sf, false);
    return out;
  },
};
