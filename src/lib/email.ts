export interface EmailSender {
  sendMagicLink(message: { to: string; url: string; expires: Date }): Promise<void>;
}

// No email provider has been chosen. A magic link grants a session, so it
// may only be printed where the console belongs to the developer: local
// `next dev`. On Vercel (preview or production) there is no sender, which
// disables sign-in.
export function getEmailSender(): EmailSender | null {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) {
    return null;
  }
  return {
    async sendMagicLink({ to, url, expires }) {
      console.info(
        `\n[agentproof] Sign-in link for ${to} (expires ${expires.toISOString()}):\n${url}\n`,
      );
    },
  };
}
