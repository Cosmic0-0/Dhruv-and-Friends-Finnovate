import { describe, expect, test } from "vitest";
import { buildScreenshotPayload, MAX_IMAGE_BYTES, ScreenshotInputError } from "../src/screenshot";

function fakeFile(type: string, size: number, name = "shot.png"): File {
  // jsdom's File keeps the byte length of its parts, so a real-sized blob part
  // gives an accurate `.size` without allocating megabytes of content.
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("buildScreenshotPayload", () => {
  test("reads an accepted image type into a data URL payload", async () => {
    const file = fakeFile("image/png", 10);
    const payload = await buildScreenshotPayload(file);
    expect(payload.image).toMatch(/^data:image\/png;base64,/);
  });

  test("rejects a non-image file", async () => {
    await expect(buildScreenshotPayload(fakeFile("application/pdf", 10, "doc.pdf"))).rejects.toThrow(ScreenshotInputError);
    await expect(buildScreenshotPayload(fakeFile("application/pdf", 10))).rejects.toThrow(/PNG, JPEG, or WEBP/);
  });

  test("rejects a file over the 5MB decoded limit", async () => {
    await expect(buildScreenshotPayload(fakeFile("image/jpeg", MAX_IMAGE_BYTES + 1))).rejects.toThrow(/larger than 5MB/);
  });

  test("accepts JPEG and WEBP as well as PNG", async () => {
    await expect(buildScreenshotPayload(fakeFile("image/jpeg", 10))).resolves.toMatchObject({});
    await expect(buildScreenshotPayload(fakeFile("image/webp", 10))).resolves.toMatchObject({});
  });
});
