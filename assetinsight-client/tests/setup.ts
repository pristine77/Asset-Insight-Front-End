import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

/*
   The upload line is a module-level singleton, so it outlives a rendered form.
   Without this, one test's account stays bound and fences the next test's
   hand-off, and a held upload leaks into an unrelated assertion.

   The import is deliberately lazy: a top-level one would load the manager — and
   with it the real resume store — before a test file's own vi.mock calls have
   registered, which would silently defeat them.
*/
afterEach(async () => {
  const { backgroundUploads } = await import("@/services/backgroundUploadManager");
  backgroundUploads.resetForTests();
});
