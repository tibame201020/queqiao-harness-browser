import { z } from "zod";

const scheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({ type: z.literal("interval"), intervalMinutes: z.number().positive().max(10080), runOnStart: z.boolean().default(true) }),
]);

export const harnessConfigInputSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
  adapter: z.string().min(1).max(64),
  defaultAction: z.string().min(1).max(64).default("trigger"),
  browser: z.object({
    engine: z.literal("chromium").default("chromium"),
    channel: z.enum(["chrome", "edge", "brave", "chromium"]).default("chrome"),
    executablePath: z.string().min(1).optional(),
    userDataDir: z.string().min(1).optional(),
    headless: z.boolean().default(true),
    startMinimized: z.boolean().default(true),
    connection: z.enum(["managed", "cdp"]).default("managed"),
    // Existing CDP is attach-only unless the private browser is explicitly Harness-owned.
    cdpRecovery: z.enum(["attach-only", "harness-owned"]).default("attach-only"),
    // Chrome 144+ can expose the user-approved chrome://inspect debugging bridge by channel name.
    cdpUrl: z.union([z.literal("chrome"), z.string().url()]).optional(),
    debugPort: z.number().int().min(1024).max(65535).optional(),
    startUrl: z.string().url().optional(),
  }).default({ engine: "chromium", channel: "chrome", headless: true, startMinimized: true, connection: "managed", cdpRecovery: "attach-only" }),
  schedule: scheduleSchema.default({ type: "manual" }),
  lifecycle: z.object({
    resumePolicy: z.literal("manual").default("manual"),
  }).default({ resumePolicy: "manual" }),
  runPolicy: z.object({
    leaseMinutes: z.number().positive().max(10080).default(50),
    busyRetryMinutes: z.number().positive().max(1440).default(5),
  }).default({ leaseMinutes: 50, busyRetryMinutes: 5 }),
  adapterConfig: z.record(z.string(), z.unknown()).default({}),
});

export type HarnessConfig = z.infer<typeof harnessConfigInputSchema>;
export type HarnessConfigInput = z.input<typeof harnessConfigInputSchema>;

export function normalizeHarnessConfig(input: HarnessConfigInput): HarnessConfig {
  const parsed = harnessConfigInputSchema.parse(input);
  if (parsed.browser.connection === "cdp" && !parsed.browser.cdpUrl) throw new Error("browser.cdpUrl is required when browser.connection=cdp");
  if (parsed.browser.cdpRecovery === "harness-owned") {
    const b = parsed.browser;
    // An owned CDP browser must use a dedicated local-only port and Harness-owned profile.
    if (b.connection !== "cdp" || b.debugPort === undefined || b.userDataDir !== undefined)
      throw new Error("harness-owned CDP requires connection=cdp, explicit debugPort and private default userDataDir");
    let url: URL;
    try { url = new URL(b.cdpUrl!); } catch { throw new Error("harness-owned CDP requires loopback http://127.0.0.1:<debugPort>"); }
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== String(b.debugPort)
      || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
      throw new Error("harness-owned CDP requires loopback http://127.0.0.1:<debugPort>");
  }
  return parsed;
}
