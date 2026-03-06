/**
 * lib/email/invite-template.ts
 * HTML email template for team invitations.
 *
 * Pure TypeScript string template with inline CSS for maximum
 * email client compatibility. No React/JSX dependency.
 */

// ── Types ────────────────────────────────────────────────────────

export interface InviteEmailParams {
  orgName: string;
  roleName: string;
  inviterName: string;
  inviteUrl: string;
  expiresInDays: number;
}

// ── Colors (matches site brand: opsos-slate + brass) ─────────────

const COLORS = {
  bg: '#f8f9fa',
  headerBg: '#0A0A0A',
  headerText: '#ffffff',
  brass: '#FF5A1F',
  brassDark: '#EA4C0C',
  text: '#333333',
  textMuted: '#666666',
  border: '#e5e7eb',
  cardBg: '#ffffff',
};

// ── Render ───────────────────────────────────────────────────────

export function renderInviteEmail(params: InviteEmailParams): string {
  const { orgName, roleName, inviterName, inviteUrl, expiresInDays } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're invited to join ${escapeHtml(orgName)} on OpSOS</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Main Card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:${COLORS.cardBg};border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${COLORS.headerBg};padding:32px 40px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:${COLORS.headerText};letter-spacing:-0.5px;">
                OpSOS
              </div>
              <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-top:4px;">
                Operational Standard Operating System
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${COLORS.text};">
                You've been invited
              </h1>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${COLORS.textMuted};">
                <strong style="color:${COLORS.text}">${escapeHtml(inviterName)}</strong>
                has invited you to join
                <strong style="color:${COLORS.text}">${escapeHtml(orgName)}</strong>
                on OpSOS.
              </p>

              <!-- Role Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background-color:${COLORS.brass};color:#ffffff;font-size:13px;font-weight:600;padding:6px 16px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">
                    ${escapeHtml(roleName)}
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(inviteUrl)}"
                       style="display:inline-block;background-color:${COLORS.brass};color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:${COLORS.textMuted};text-align:center;">
                This invitation expires in ${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}.
              </p>

              <!-- PWA Install Guide -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:32px;border-top:1px solid ${COLORS.border};padding-top:24px;">
                <tr>
                  <td>
                    <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:${COLORS.text};">
                      Install on Your Phone
                    </h2>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${COLORS.textMuted};">
                      Add OpSOS to your home screen for instant access — no app store needed.
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <!-- iPhone -->
                      <tr>
                        <td style="padding-bottom:16px;">
                          <div style="font-size:14px;font-weight:600;color:${COLORS.text};margin-bottom:6px;">iPhone (Safari only)</div>
                          <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:${COLORS.textMuted};">
                            <li>Open <strong style="color:${COLORS.text};">Safari</strong> and log in</li>
                            <li>Tap the <strong style="color:${COLORS.text};">Share</strong> button (square with arrow)</li>
                            <li>Tap <strong style="color:${COLORS.text};">"Add to Home Screen"</strong></li>
                          </ol>
                        </td>
                      </tr>
                      <!-- Android -->
                      <tr>
                        <td>
                          <div style="font-size:14px;font-weight:600;color:${COLORS.text};margin-bottom:6px;">Android (Chrome)</div>
                          <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:${COLORS.textMuted};">
                            <li>Open <strong style="color:${COLORS.text};">Chrome</strong> and log in</li>
                            <li>Tap the <strong style="color:${COLORS.text};">three-dot menu</strong> (top right)</li>
                            <li>Tap <strong style="color:${COLORS.text};">"Install app"</strong> or <strong style="color:${COLORS.text};">"Add to Home screen"</strong></li>
                          </ol>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid ${COLORS.border};text-align:center;">
              <p style="margin:0;font-size:12px;color:${COLORS.textMuted};">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
