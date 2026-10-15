import { NotImplementedError } from "@rebar/core/contracts";
import { defineCommand } from "@rebar/core/module-server";
import {
  accountInput,
  connectStartInput,
  createMeetingInput,
  deleteEventInput,
  disconnectInput,
  forRecordInput,
  linkInput,
  moveInput,
  rangeInput,
  refreshCalendarsInput,
  setWriteTargetInput,
  settingsGetInput,
  settingsSaveInput,
  suggestLinksInput,
  syncInput,
  testInput,
  toggleCalendarInput,
} from "../contract";

/*
  Příkazy kalendáře (`kalendar.*`). Čtení vyžaduje `kalendar.read`, zápis `kalendar.write`; rozsah „jen moje“ znamená
  jen vlastní účet a vlastní události, rozsah „vše“ i kalendáře ostatních (cizí soukromé jako „Obsazeno“).
  M1: stub příkazy (kontrakt je hotový, těla následují).
*/

const READ = "kalendar.read";
const WRITE = "kalendar.write";

const todo = (name: string) => async (): Promise<never> => {
  throw new NotImplementedError(`kalendar.${name}`);
};

export const rangeCommand = defineCommand({
  name: "kalendar.range",
  permission: READ,
  input: rangeInput,
  handler: todo("range"),
});
export const accountCommand = defineCommand({
  name: "kalendar.account",
  permission: READ,
  input: accountInput,
  handler: todo("account"),
});
export const connectStartCommand = defineCommand({
  name: "kalendar.connect.start",
  permission: WRITE,
  input: connectStartInput,
  handler: todo("connect.start"),
});
export const disconnectCommand = defineCommand({
  name: "kalendar.disconnect",
  permission: WRITE,
  input: disconnectInput,
  handler: todo("disconnect"),
});
export const refreshCalendarsCommand = defineCommand({
  name: "kalendar.calendars.refresh",
  permission: WRITE,
  input: refreshCalendarsInput,
  handler: todo("calendars.refresh"),
});
export const toggleCalendarCommand = defineCommand({
  name: "kalendar.toggleCalendar",
  permission: WRITE,
  input: toggleCalendarInput,
  handler: todo("toggleCalendar"),
});
export const setWriteTargetCommand = defineCommand({
  name: "kalendar.setWriteTarget",
  permission: WRITE,
  input: setWriteTargetInput,
  handler: todo("setWriteTarget"),
});
export const syncCommand = defineCommand({
  name: "kalendar.sync",
  permission: WRITE,
  input: syncInput,
  handler: todo("sync"),
});
export const testCommand = defineCommand({
  name: "kalendar.test",
  permission: WRITE,
  input: testInput,
  handler: todo("test"),
});
export const createMeetingCommand = defineCommand({
  name: "kalendar.createMeeting",
  permission: WRITE,
  input: createMeetingInput,
  handler: todo("createMeeting"),
});
export const moveCommand = defineCommand({
  name: "kalendar.move",
  permission: WRITE,
  input: moveInput,
  handler: todo("move"),
});
export const deleteEventCommand = defineCommand({
  name: "kalendar.delete",
  permission: WRITE,
  input: deleteEventInput,
  handler: todo("delete"),
});
export const linkCommand = defineCommand({
  name: "kalendar.link",
  permission: WRITE,
  input: linkInput,
  handler: todo("link"),
});
export const suggestLinksCommand = defineCommand({
  name: "kalendar.suggestLinks",
  permission: READ,
  input: suggestLinksInput,
  handler: todo("suggestLinks"),
});
export const forRecordCommand = defineCommand({
  name: "kalendar.forRecord",
  permission: READ,
  input: forRecordInput,
  handler: todo("forRecord"),
});
export const settingsGetCommand = defineCommand({
  name: "kalendar.settings.get",
  permission: "settings.manage",
  input: settingsGetInput,
  handler: todo("settings.get"),
});
export const settingsSaveCommand = defineCommand({
  name: "kalendar.settings.save",
  permission: "settings.manage",
  input: settingsSaveInput,
  handler: todo("settings.save"),
});

/** Všechny příkazy kalendáře. */
export const googleCommands = [
  rangeCommand,
  accountCommand,
  connectStartCommand,
  disconnectCommand,
  refreshCalendarsCommand,
  toggleCalendarCommand,
  setWriteTargetCommand,
  syncCommand,
  testCommand,
  createMeetingCommand,
  moveCommand,
  deleteEventCommand,
  linkCommand,
  suggestLinksCommand,
  forRecordCommand,
  settingsGetCommand,
  settingsSaveCommand,
];
