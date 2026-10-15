import { describe, expect, it } from "vitest";
import {
  addressText,
  contactActions,
  dialDigits,
  internationalDigits,
  mailHref,
  mapsLink,
  smsHref,
  telHref,
  whatsappHref,
} from "./contact-actions";

describe("telefonní odkazy (MOB-02, MOB-04)", () => {
  it("tel: a sms: zachovají + a vyhodí mezery", () => {
    expect(telHref("+420 777 123 456")).toBe("tel:+420777123456");
    expect(smsHref("777 123 456")).toBe("sms:777123456");
  });
  it("prázdné a nesmyslné číslo nedá odkaz", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("  ")).toBeNull();
    expect(telHref("12")).toBeNull();
    expect(dialDigits("abc")).toBeNull();
  });
  it("WhatsApp chce mezinárodní tvar bez +", () => {
    expect(whatsappHref("+420 777 123 456")).toBe("https://wa.me/420777123456");
    expect(whatsappHref("00420777123456")).toBe("https://wa.me/420777123456");
    expect(whatsappHref("777123456")).toBe("https://wa.me/420777123456");
    expect(internationalDigits("+49 30 1234567")).toBe("49301234567");
  });
});

describe("e-mail, adresa a mapy", () => {
  it("mailto jen u platného e-mailu", () => {
    expect(mailHref(" info@firma.cz ")).toBe("mailto:info@firma.cz");
    expect(mailHref("není")).toBeNull();
  });
  it("adresa se složí do jednoho řádku, CZ se nepíše", () => {
    expect(addressText({ street: "Americká 12", zip: "30100", city: "Plzeň", country: "CZ" })).toBe(
      "Americká 12, 30100 Plzeň",
    );
    expect(addressText({ city: "Wien", country: "AT" })).toBe("Wien, AT");
    expect(addressText({})).toBeNull();
  });
  it("odkaz do map kóduje adresu", () => {
    expect(mapsLink("Americká 12, Plzeň")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Americk%C3%A1%2012%2C%20Plze%C5%88",
    );
    expect(mapsLink(" ")).toBeNull();
  });
});

describe("contactActions", () => {
  const data = {
    phone: "777123456",
    email: "a@b.cz",
    address: "Plzeň",
    driveUrl: "https://drive.google.com/x",
  };
  it("pořadí Zavolat, SMS, WhatsApp, E-mail, Navigovat, Disk", () => {
    expect(contactActions(data).map((a) => a.kind)).toEqual([
      "call",
      "sms",
      "whatsapp",
      "mail",
      "navigate",
      "drive",
    ]);
  });
  it("karta kontaktu: jen volání, SMS, WhatsApp a e-mail; bez údaje se akce vynechá", () => {
    expect(
      contactActions({ phone: "777123456" }, ["call", "sms", "whatsapp", "mail"]).map(
        (a) => a.kind,
      ),
    ).toEqual(["call", "sms", "whatsapp"]);
  });
  it("Disk jen na https", () => {
    expect(contactActions({ driveUrl: "javascript:alert(1)" })).toEqual([]);
  });
});
