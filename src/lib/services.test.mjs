import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNewService, codeFromName, freeCode, isPorterService, serviceSaveMessage } from "./services.js";

test("the code is made from the name", () => {
  assert.equal(codeFromName("VIP Fast Track"), "vip_fast_track");
  assert.equal(codeFromName("  Wheelchair & Mobility Help!  "), "wheelchair_and_mobility_help");
  assert.equal(codeFromName("Café Lounge Pass"), "cafe_lounge_pass");
  assert.equal(codeFromName("24h Concierge"), "svc_24h_concierge");
  assert.equal(codeFromName("***"), "");
  assert.ok(codeFromName("a ".repeat(60)).length <= 40);
});

test("a code that is taken gets a number", () => {
  assert.equal(freeCode("VIP Fast Track", ["full_arrival"]), "vip_fast_track");
  assert.equal(freeCode("VIP Fast Track", ["vip_fast_track"]), "vip_fast_track_2");
  assert.equal(freeCode("VIP Fast Track", ["vip_fast_track", "vip_fast_track_2"]), "vip_fast_track_3");
  assert.equal(freeCode("", []), "");
  const long = "x".repeat(60);
  assert.ok(freeCode(long, [codeFromName(long)]).length <= 40);
});

test("porter services are told apart by kind, with the original rule for older data", () => {
  assert.equal(isPorterService({ code: "wheelchair", kind: "porter" }), true);
  assert.equal(isPorterService({ code: "vip", kind: "meet_assist" }), false);
  assert.equal(isPorterService({ code: "porter_only" }), true); // a record from before kinds existed
  assert.equal(isPorterService({ code: "full_arrival" }), false);
  assert.equal(isPorterService("wheelchair", [{ code: "wheelchair", kind: "porter" }]), true);
  assert.equal(isPorterService("porter_only", []), true);
  assert.equal(isPorterService("nothing_here", []), false);
  assert.equal(isPorterService(undefined), false);
});

const good = { name: "VIP Fast Track", code: "vip_fast_track", kind: "meet_assist", flight_type: "departure", price: "300", price_usd: "25", description: "Straight to the front.", inclusions: "Fast lane, Escort", includes_lounge: true };

test("a good form has no problems and is tidied for saving", () => {
  const { problems, value } = checkNewService(good, ["full_arrival"]);
  assert.deepEqual(problems, {});
  assert.deepEqual(value, { code: "vip_fast_track", name: "VIP Fast Track", kind: "meet_assist", flight_type: "departure", price: 300, price_usd: 25, description: "Straight to the front.", inclusions: "Fast lane, Escort", exclusions: "", includes_lounge: true, active: true });
});

test("each problem is named against its field", () => {
  const p = (changes, codes = []) => checkNewService({ ...good, ...changes }, codes).problems;
  assert.ok(p({ name: "ab" }).name);
  assert.ok(p({ code: "Bad Code" }).code);
  assert.ok(p({}, ["vip_fast_track"]).code);
  assert.ok(p({ price: "" }).price);
  assert.ok(p({ price: "0" }).price);
  assert.ok(p({ price_usd: "-5" }).price_usd);
  assert.ok(p({ flight_type: "both" }).flight_type, "meet and assist cannot run both ways");
  assert.deepEqual(p({ kind: "porter", flight_type: "both" }), {});
  assert.ok(p({ kind: "spa" }).kind);
  assert.ok(p({ flight_type: "sideways" }).flight_type);
  assert.ok(p({ description: "x".repeat(201) }).description);
});

test("optional parts, and the lounge only where it makes sense", () => {
  assert.equal(checkNewService({ ...good, price_usd: "" }).value.price_usd, null);
  assert.equal(checkNewService({ ...good, description: "  " }).value.description, null);
  assert.equal(checkNewService({ ...good, flight_type: "arrival" }).value.includes_lounge, false);
  assert.equal(checkNewService({ ...good, kind: "porter", flight_type: "both" }).value.includes_lounge, false);
  assert.equal(checkNewService({ ...good, price: "299.999" }).value.price, 300);
  assert.equal(checkNewService({ ...good, active: false }).value.active, false);
});

test("what the database refuses is explained", () => {
  assert.match(serviceSaveMessage({ message: 'duplicate key value violates unique constraint "service_packages_code_key"' }), /already uses that code/);
  assert.match(serviceSaveMessage({ message: "service_code_is_fixed" }), /cannot be changed/);
  assert.match(serviceSaveMessage({ message: "new row violates row-level security policy" }), /Only an admin/);
  assert.match(serviceSaveMessage({ message: "something else" }), /something else/);
});
