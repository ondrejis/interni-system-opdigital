/** Testovací pomůcky modulu „kalendar“ (`@rebar/kalendar/testing`): fake Google a podstrčení klienta. */
export { createFakeGoogle } from "./fake-google";
export type { FakeCall, FakeGoogle, FakePing } from "./fake-google";
export { setGoogleClientOverride } from "./env";
