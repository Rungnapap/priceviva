import { test } from "node:test";
import assert from "node:assert/strict";
import { contactEmail } from "../src/lib/server/contact";

test("contact address comes only from CONTACT_EMAIL and must look like an email", () => {
  assert.equal(contactEmail({}), null);
  assert.equal(contactEmail({ CONTACT_EMAIL: "  " }), null);
  assert.equal(contactEmail({ CONTACT_EMAIL: "not an email" }), null);
  assert.equal(contactEmail({ CONTACT_EMAIL: "x@y" }), null);
  assert.equal(contactEmail({ CONTACT_EMAIL: '"><script>@x.com' }), null);
  assert.equal(contactEmail({ CONTACT_EMAIL: " hello@priceviva.example " }), "hello@priceviva.example");
});
