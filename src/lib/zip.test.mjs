import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, makeZip } from "./zip.js";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("the zip opens and holds the files", () => {
  const zip = makeZip([{ name: "journal.csv", text: "a,b\r\n1,2\r\n" }, { name: "été.csv", text: "é" }]);
  const sig = new DataView(zip.buffer).getUint32(0, true);
  assert.equal(sig, 0x04034b50);
  let unzip = null;
  try { execFileSync("unzip", ["-v"], { stdio: "ignore" }); unzip = "unzip"; } catch { /* not installed */ }
  if (!unzip) return;
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const file = join(dir, "t.zip");
  writeFileSync(file, zip);
  const listing = execFileSync("unzip", ["-t", file]).toString();
  assert.match(listing, /No errors detected/);
  assert.equal(execFileSync("unzip", ["-p", file, "journal.csv"]).toString(), "a,b\r\n1,2\r\n");
});
