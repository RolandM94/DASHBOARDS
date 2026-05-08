import sparticuzChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";

export type PdfOptions = NonNullable<Parameters<Page["pdf"]>[0]>;
export type SetContentWaitUntil = NonNullable<Parameters<Page["setContent"]>[1]>["waitUntil"];

export interface RenderPdfOptions {
  pdf: PdfOptions;
  waitUntil?: SetContentWaitUntil;
  onTiming?: (stage: "chromiumLaunch" | "pageContentLoad" | "pagePdf", ms: number) => void;
}

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const isLinux = process.platform === "linux";
  const launchOptions = isLinux
    ? {
        args: sparticuzChromium.args,
        executablePath: await sparticuzChromium.executablePath(),
        headless: sparticuzChromium.headless,
      }
    : { headless: true as const };

  return chromium.launch(launchOptions);
}

async function getBrowser(onTiming?: RenderPdfOptions["onTiming"]): Promise<Browser> {
  const existing = browserPromise ? await browserPromise.catch(() => null) : null;
  if (existing?.isConnected()) return existing;

  const start = performance.now();
  browserPromise = launchBrowser();
  try {
    const browser = await browserPromise;
    onTiming?.("chromiumLaunch", performance.now() - start);
    return browser;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

async function renderWithBrowser(browser: Browser, html: string, options: RenderPdfOptions): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    const loadStart = performance.now();
    await page.setContent(html, { waitUntil: options.waitUntil ?? "load" });
    options.onTiming?.("pageContentLoad", performance.now() - loadStart);

    const pdfStart = performance.now();
    const pdf = await page.pdf(options.pdf);
    options.onTiming?.("pagePdf", performance.now() - pdfStart);
    return new Uint8Array(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function renderPdfFromHtml(html: string, options: RenderPdfOptions): Promise<Uint8Array> {
  const browser = await getBrowser(options.onTiming);
  try {
    return await renderWithBrowser(browser, html, options);
  } catch {
    browserPromise = null;
    await browser.close().catch(() => undefined);

    const retryBrowser = await getBrowser(options.onTiming);
    return renderWithBrowser(retryBrowser, html, options);
  }
}

export async function closeSharedPdfBrowserForTests(): Promise<void> {
  const browser = browserPromise ? await browserPromise.catch(() => null) : null;
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}
