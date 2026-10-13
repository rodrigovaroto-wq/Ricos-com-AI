import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armOf, armOn } from "@/agent/experiments.js";
import { kitHoldsLink, missingForLink, sendLinkNow } from "@/agent/interpret.js";
import { linkMessage } from "@/agent/retry.js";

/**
 * Experiment B (R20.6, plano 13 §E6): in arm 1 with `experiments.linkAfterChoice`, the link goes right
 * after the payment choice and the checkout collects name, e-mail and CPF. Arm 0, the flag absent (the
 * production secret today) or false: the order of grafo §63/§67, untouched.
 */
const turn = readFileSync("supabase/functions/turn/index.ts", "utf-8");

const afterChoice = { sizeKnown: true, cepKnown: true, pathSettled: true, choiceMade: true, nameKnown: false, cpfDone: false };

describe("E6 — experimento B: link logo depois da escolha do pagamento", () => {
  it("braço B: com tamanho, CEP e caminho, o link sai sem nome, e-mail nem CPF", () => {
    expect(missingForLink({ ...afterChoice, emailDone: false, identityAtCheckout: true })).toBeNull();
    expect(missingForLink({ ...afterChoice, identityAtCheckout: true })).toBeNull();
    expect(sendLinkNow({ ...afterChoice, emailDone: false, identityAtCheckout: true, yesBesideQuestion: false })).toBe(true);
  });

  it.each([{}, { identityAtCheckout: false }])("negação: %o = a ordem de hoje (nome → e-mail no antecipado → CPF)", (flag) => {
    const d = { ...afterChoice, ...flag };
    expect(missingForLink({ ...d, emailDone: false })).toBe("name");
    expect(missingForLink({ ...d, nameKnown: true, emailDone: false })).toBe("email");
    expect(missingForLink({ ...d, nameKnown: true, emailDone: true })).toBe("document");
    expect(missingForLink({ ...d, nameKnown: true })).toBe("document");
    expect(sendLinkNow({ ...d, emailDone: false, yesBesideQuestion: false })).toBe(false);
  });

  it.each([
    ["sizeKnown", "size"],
    ["cepKnown", "cep"],
    ["pathSettled", "payment"],
  ] as const)("nenhum braço: sem %s o link não sai (falta %s)", (field, datum) => {
    for (const flag of [{ identityAtCheckout: true }, { identityAtCheckout: false }, {}]) {
      const d = { ...afterChoice, nameKnown: true, cpfDone: true, ...flag, [field]: false };
      expect(missingForLink(d)).toBe(datum);
      expect(sendLinkNow({ ...d, yesBesideQuestion: false })).toBe(false);
    }
  });

  it("o \"sim\" ao lado de pergunta segura o link também no braço B", () => {
    expect(sendLinkNow({ ...afterChoice, identityAtCheckout: true, yesBesideQuestion: true })).toBe(false);
  });

  it("o turno liga o braço B só por armOn — flag no config E braço 1 do sorteio B", () => {
    expect(turn).toContain(`identityAtCheckout: armOn(CONFIG.experiments, lead.arm ?? armOf(lead.phone), "B"),`);
    expect(turn).toContain(`choiceMade: paymentChoice !== null && paymentChoice === linkPath,`);
    const phone = "5511999990000";
    expect(armOn(undefined, armOf(phone), "B")).toBe(false);
    expect(armOn({ linkAfterChoice: false }, { A: 1, B: 1 }, "B")).toBe(false);
    expect(armOn({ linkAfterChoice: true }, { A: 1, B: 0 }, "B")).toBe(false);
    expect(armOn({ linkAfterChoice: true }, { A: 0, B: 1 }, "B")).toBe(true);
  });

  it("no braço B a diretiva de identidade não sai, e o link escrito pelo modelo não pede os dados", () => {
    // `missing` null in arm B: the identity directive only fires on name/email/document.
    expect(turn).toContain(`!(missing === "name" || missing === "email" || missing === "document")`);
    expect(turn).toContain(`: linkData.identityAtCheckout && missing === null`);
  });

  it("modo de falha (revisão de 9c1053c): no braço B a região sem pagamento na entrega não é escolha — o link espera o sim dela", () => {
    // `pathSettled` is true from the region alone; arm B must wait for `paymentChoice`, or the prepaid link
    // goes in the CEP's own turn, before she heard why or said yes.
    expect(turn).toContain(`pathSettled: paymentChoice !== null || knownRegion?.cod === false,`);
    // Arm B, region settled the path, she chose nothing: the order of today holds — the name, never the link.
    const regionOnly = { ...afterChoice, choiceMade: false, identityAtCheckout: true };
    expect(missingForLink(regionOnly)).toBe("name");
    expect(sendLinkNow({ ...regionOnly, nameKnown: false, yesBesideQuestion: false })).toBe(false);
    expect(missingForLink({ ...regionOnly, choiceMade: true })).toBeNull();
  });

  it("no antecipado do braço B, o modelo que escreve o link avisa do e-mail (§67, Leila)", () => {
    expect(turn).toContain("Se escrever o link, avise que lá vai pedir o e-mail dela.");
    expect(turn).toContain(`linkPath === "prepay" && chatEmail === null ?`);
  });

  it("o link fixo diz o que ela preenche no checkout (grafo §67)", () => {
    const text = linkMessage("https://x.test/c", "prepay", "M", "Encorpa", 1, ["nome completo", "e-mail", "CPF"]);
    expect(text).toContain("No checkout você vai preencher também o seu nome completo, o seu e-mail e o seu CPF");
  });

  it("braço B: o kit é oferecido uma vez, com os descontos, antes do link (operador, 2026-10-12)", () => {
    const b = { identityAtCheckout: true, units: 1, kitsOnPath: 2, kitOffered: false, pathChosen: true, linkSentBefore: false };
    expect(kitHoldsLink(b)).toBe(true);
    expect(kitHoldsLink({ ...b, kitOffered: true })).toBe(false); // offered once, then the link
    expect(kitHoldsLink({ ...b, units: 2 })).toBe(false); // she took a kit: its own link
    expect(kitHoldsLink({ ...b, kitsOnPath: 0 })).toBe(false); // no kit on her path
    expect(kitHoldsLink({ ...b, identityAtCheckout: false })).toBe(false); // arm 0: the kit comes before the data
    expect(kitHoldsLink({ ...b, identityAtCheckout: undefined })).toBe(false);
    // Review of 2695b80: hold only when the offer goes this same turn, and never after a link went out.
    expect(kitHoldsLink({ ...b, pathChosen: false })).toBe(false);
    expect(kitHoldsLink({ ...b, linkSentBefore: true })).toBe(false);
    expect(turn).toContain("const linkNow = linkUnheld && !kitFirst;");
    expect(turn).toContain("levando mais peças o desconto sobe");
    // the "vou pensar" gets the link even while the kit is pending (review of 2695b80, 1)
    expect(turn).toContain("thinkLink = linkUnheld && !(linkInChat");
    // pathChosen is the same one kitOfferNow reads, computed once before both
    expect(turn.indexOf("const pathChosen =")).toBeLessThan(turn.indexOf("const kitFirst = kitHoldsLink("));
    expect(turn.match(/const pathChosen =/g)).toHaveLength(1);
  });
});
