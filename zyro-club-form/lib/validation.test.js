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

test("accepts a valid optional email address", () => {
  const result = validateRegistration({
    zaloName: "Long",
    duration: "long",
    gender: "male",
    position: "defender",
    level: "newbie",
    goal: "Chơi vui và rèn luyện cùng nhóm.",
    email: "long@example.com",
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.email, "long@example.com");
});

test("keeps email optional but rejects an invalid address when supplied", () => {
  const withoutEmail = validateRegistration({
    zaloName: "Long",
    duration: "long",
    gender: "male",
    position: "defender",
    level: "newbie",
    goal: "Chơi vui và rèn luyện cùng nhóm.",
  });
  assert.equal(withoutEmail.ok, true);

  const invalidEmail = validateRegistration({
    zaloName: "Long",
    duration: "long",
    gender: "male",
    position: "defender",
    level: "newbie",
    goal: "Chơi vui và rèn luyện cùng nhóm.",
    email: "not-an-email",
  });
  assert.equal(invalidEmail.ok, false);
  assert.ok(invalidEmail.errors.email);
});

test("returns field errors for incomplete data", () => {
  const result = validateRegistration({ zaloName: "A", goal: "" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.zaloName);
  assert.ok(result.errors.duration);
  assert.ok(result.errors.goal);
});