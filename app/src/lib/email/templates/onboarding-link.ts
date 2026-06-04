/**
 * Email template: send a client their onboarding form link.
 *
 * Plain HTML for now (no React Email yet — overkill for one template).
 * When the template count grows past ~5, swap to `@react-email/components`
 * + render-to-string and keep the same `render(args)` signature.
 */

export type OnboardingLinkArgs = {
    clientName: string;
    link: string;
    fromTeamMember?: string; // optional sender name (e.g. CEO)
};

export function renderOnboardingLinkEmail(args: OnboardingLinkArgs) {
    const { clientName, link, fromTeamMember } = args;

    const senderLine = fromTeamMember
        ? `Thanks,<br/>${escapeHtml(fromTeamMember)} from Nexov`
        : `Thanks,<br/>The Nexov team`;

    const subject = `Welcome to Nexov — let's get your project started`;

    const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 16px;">Hi ${escapeHtml(clientName)},</h2>

    <p>Welcome aboard — we're excited to start working with you.</p>

    <p>To kick things off, please fill in your project onboarding form. It takes about 10–15 minutes and helps us prepare everything before our first working session:</p>

    <p style="margin: 28px 0;">
      <a href="${escapeHtmlAttr(link)}"
         style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Open my onboarding form
      </a>
    </p>

    <p style="font-size: 13px; color: #555;">Or copy this link into your browser:<br/>
      <span style="color: #0f172a; word-break: break-all;">${escapeHtml(link)}</span>
    </p>

    <p>You can save your progress and come back later — nothing is shared with the team until you click Submit.</p>

    <p>If anything's unclear, just reply to this email.</p>

    <p style="margin-top: 32px;">${senderLine}</p>

    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888;">
      Nexov — websites, apps, ads, and brand for Malaysian businesses.
    </p>
  </body>
</html>`;

    const text = `Hi ${clientName},

Welcome aboard — we're excited to start working with you.

To kick things off, please fill in your project onboarding form. It takes about 10–15 minutes:

${link}

You can save progress and return later. Nothing is shared with the team until you click Submit.

If anything's unclear, just reply to this email.

Thanks,
${fromTeamMember ?? "The Nexov team"}
`;

    return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Tiny HTML escape — avoid pulling in a lib for this.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(s: string): string {
    return escapeHtml(s);
}
