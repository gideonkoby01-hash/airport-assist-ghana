import { test } from "node:test";
import assert from "node:assert/strict";
import { PORTER_METRICS, SUPERVISOR_METRICS, barShare, collectionRate, rankRows, realSupervisors } from "./leaderboard.js";

const sup = (name, completed, billed, collected, rating, ratings, id = name) => ({ supervisor_id: id, name, completed, billed, collected, rating, ratings });
const metric = (list, key) => list.find((m) => m.key === key);

test("highest first, with tied rows sharing a rank", () => {
  const rows = rankRows([sup("Ama", 10, 0, 0, 0, 0), sup("Kofi", 12, 0, 0, 0, 0), sup("Esi", 10, 0, 0, 0, 0), sup("Yaw", 3, 0, 0, 0, 0)], metric(SUPERVISOR_METRICS, "completed"));
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [["Kofi", 1], ["Ama", 2], ["Esi", 2], ["Yaw", 4]]);
});

test("a rating needs enough ratings, otherwise the supervisor is listed but not ranked", () => {
  const rows = rankRows([sup("Ama", 5, 0, 0, 5, 1), sup("Kofi", 5, 0, 0, 4.4, 20), sup("Esi", 5, 0, 0, 4.1, 3), sup("Yaw", 5, 0, 0, 4.8, 2)], metric(SUPERVISOR_METRICS, "rating"));
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [["Kofi", 1], ["Esi", 2], ["Ama", null], ["Yaw", null]]);
});

test("collection rate is collected over billed, and nothing billed is not ranked", () => {
  assert.equal(collectionRate({ billed: 1000, collected: 900 }), 0.9);
  assert.equal(collectionRate({ billed: 1000, collected: 1200 }), 1);
  assert.equal(collectionRate({ billed: 0, collected: 0 }), null);
  const rows = rankRows([sup("Ama", 1, 1000, 500, 0, 0), sup("Kofi", 1, 0, 0, 0, 0), sup("Esi", 1, 800, 800, 0, 0)], metric(SUPERVISOR_METRICS, "collection"));
  assert.deepEqual(rows.map((r) => [r.name, r.rank]), [["Esi", 1], ["Ama", 2], ["Kofi", null]]);
});

test("porters rank on passengers, jobs or earnings", () => {
  const porters = [{ name: "Kojo", jobs: 12, passengers: 20, commission: 600 }, { name: "Yaw", jobs: 15, passengers: 18, commission: 540 }];
  assert.equal(rankRows(porters, metric(PORTER_METRICS, "passengers"))[0].name, "Kojo");
  assert.equal(rankRows(porters, metric(PORTER_METRICS, "jobs"))[0].name, "Yaw");
  assert.equal(rankRows(porters, metric(PORTER_METRICS, "commission"))[0].name, "Kojo");
});

test("equal rows are ordered by name, and numbers can arrive as text", () => {
  const rows = rankRows([{ name: "Zane", passengers: "5" }, { name: "Abena", passengers: 5 }], metric(PORTER_METRICS, "passengers"));
  assert.deepEqual(rows.map((r) => r.name), ["Abena", "Zane"]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 1]);
});

test("unassigned bookings are not a supervisor", () => {
  assert.equal(realSupervisors([{ supervisor_id: null, name: "Unassigned" }, { supervisor_id: "s1", name: "Ama" }]).length, 1);
  assert.deepEqual(rankRows([], metric(SUPERVISOR_METRICS, "completed")), []);
});

test("bar share", () => {
  assert.equal(barShare(50, 100), 0.5);
  assert.equal(barShare(0, 0), 0);
  assert.equal(barShare(null, 100), 0);
  assert.equal(barShare(150, 100), 1);
});
