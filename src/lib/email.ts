import { Resend } from "resend";

export interface EmailSender {
  sendMagicLink(message: { to: string; url: string; expires: Date }): Promise<void>;
}

export function getEmailSender(): EmailSender | null {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    return {
      async sendMagicLink({ to, url, expires }) {
        const { error } = await resend.emails.send({
          from: process.env.EMAIL_FROM!,
          to,
          subject: "Sign in to AgentProof",
          text: `Sign in to AgentProof: ${url}\n\nThis link expires at ${expires.toISOString()} and can only be used once.`,
          html: [
            "<p>Use this one-time link to sign in to AgentProof:</p>",
            `<p><a href="${escapeHtml(url)}">Sign in to AgentProof</a></p>`,
            `<p>This link expires at ${escapeHtml(expires.toISOString())}.</p>`,
          ].join(""),
        });
        if (error) {
          throw new Error(`Resend could not send the sign-in link: ${error.message}`);
        }
      },
    };
  }

  // Printing a magic link is allowed only when the console belongs to the
  // developer. A deployed app without Resend remains explicitly unconfigured.
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;

  return {
    async sendMagicLink({ to, url, expires }) {
      console.info(
        `\n[agentproof] Sign-in link for ${to} (expires ${expires.toISOString()}):\n${url}\n`,
      );
    },
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
