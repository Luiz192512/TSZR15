import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_TIME_ZONE,
  formatAdminDisplayDateTime,
  formatAdminDateTimeInput,
  parseAdminDateTimeInput,
  parseAdminMoneyToCents,
} from "../src/admin/admin-form-values.js";

test("admin money parser accepts Brazilian and dot-decimal formats", () => {
  assert.equal(parseAdminMoneyToCents("199,90"), 19990);
  assert.equal(parseAdminMoneyToCents("199.90"), 19990);
  assert.equal(parseAdminMoneyToCents("2490"), 249000);
  assert.equal(parseAdminMoneyToCents("2.490,00"), 249000);
  assert.equal(parseAdminMoneyToCents("2,490.00"), 249000);
});

test("admin money parser rejects malformed, negative and disallowed zero values", () => {
  assert.equal(parseAdminMoneyToCents("1.2.3"), null);
  assert.equal(parseAdminMoneyToCents("-10,00"), null);
  assert.equal(parseAdminMoneyToCents("0"), null);
  assert.equal(parseAdminMoneyToCents("0", { allowZero: true }), 0);
  assert.equal(parseAdminMoneyToCents(""), null);
});

test("admin datetime helpers convert between Brasilia local time and UTC", () => {
  assert.equal(ADMIN_TIME_ZONE, "America/Sao_Paulo");
  assert.equal(
    parseAdminDateTimeInput("2026-07-11T12:00"),
    "2026-07-11T15:00:00.000Z",
  );
  assert.equal(
    formatAdminDateTimeInput("2026-07-11T15:00:00.000Z"),
    "2026-07-11T12:00",
  );
});

test("admin datetime parser rejects invalid local values", () => {
  assert.equal(parseAdminDateTimeInput(""), null);
  assert.equal(parseAdminDateTimeInput("2026-02-30T12:00"), null);
  assert.equal(parseAdminDateTimeInput("not-a-date"), null);
  assert.equal(formatAdminDateTimeInput("not-a-date"), "");
});

test("admin display timestamps stay in Brasilia time on UTC servers", () => {
  assert.match(
    formatAdminDisplayDateTime("2026-07-11T15:00:00.000Z"),
    /11\/07\/2026.*12:00/,
  );
});
