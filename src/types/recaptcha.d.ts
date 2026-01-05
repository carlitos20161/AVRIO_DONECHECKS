// TypeScript declarations for reCAPTCHA Enterprise

interface GrecaptchaEnterprise {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

declare global {
  interface Window {
    grecaptcha: {
      enterprise: GrecaptchaEnterprise;
    };
  }
}

export {};




