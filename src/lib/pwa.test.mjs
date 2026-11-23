import { test } from "node:test";
import assert from "node:assert/strict";
import { DISMISS_DAYS, IOS_STEPS, installMode, isDismissed, isStandalone, platformOf } from "./pwa.js";

test("which phone it is", () => {
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "ios");
  assert.equal(platformOf("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)"), "ios");
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36"), "android");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 5), "ios", "an iPad asking for the desktop site");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", 0), "other", "a real Mac");
  assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"), "other");
  assert.equal(platformOf(), "other");
});

test("running as an installed app", () => {
  assert.equal(isStandalone({ displayModeStandalone: true }), true);
  assert.equal(isStandalone({ navigatorStandalone: true }), true, "iPhone's own flag");
  assert.equal(isStandalone({}), false);
  assert.equal(isStandalone(), false);
});

test("what to offer", () => {
  assert.equal(installMode({ standalone: true, hasPrompt: true, platform: "android" }), "installed");
  assert.equal(installMode({ hasPrompt: true, platform: "android" }), "prompt");
  assert.equal(installMode({ platform: "ios" }), "ios");
  assert.equal(installMode({ platform: "other" }), "none");
  assert.equal(installMode(), "none");
});

test("a dismissed offer stays away for a month, then returns", () => {
  const now = Date.UTC(2026, 11, 1);
  assert.equal(isDismissed(String(now - 2 * 86400000), now), true);
  assert.equal(isDismissed(now - (DISMISS_DAYS - 1) * 86400000, now), true);
  assert.equal(isDismissed(now - (DISMISS_DAYS + 1) * 86400000, now), false);
  assert.equal(isDismissed(null, now), false);
  assert.equal(isDismissed("junk", now), false);
});

test("the iPhone steps are there", () => {
  assert.equal(IOS_STEPS.length, 3);
  assert.match(IOS_STEPS[1], /Add to Home Screen/);
});
