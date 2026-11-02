import test from "node:test";
import assert from "node:assert/strict";
import { validateRegistration } from "./validation.js";

test("accepts a complete ZYRO registration", () => {
  const result = validateRegistration({
    zaloName: "Long",
    duration: "long",
    gender: "male",
    position: "defender",
    level: "newbie",
    goal: "Chơi vui, học thêm kỹ thuật và quen thêm bạn mới.",
  });
  assert.equal(result.ok, true);
});

test("returns field errors for incomplete data", () => {
  const result = validateRegistration({ zaloName: "A", goal: "" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.zaloName);
  assert.ok(result.errors.duration);
  assert.ok(result.errors.goal);
});
