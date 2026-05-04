declare module "@sparticuz/chromium" {
  const chromium: {
    args: string[];
    executablePath(): Promise<string>;
    headless: boolean;
  };
  export default chromium;
}
